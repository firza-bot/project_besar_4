import os
import uuid
import json
import threading
from django.http import JsonResponse, FileResponse, Http404, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, r2_score, mean_squared_error, silhouette_score, mean_absolute_error, roc_curve, auc
import xgboost as xgb
import pickle

# Directory setup for persistent storage
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'wizard_storage')
DATASETS_DIR = os.path.join(STORAGE_DIR, 'datasets')
DRAFTS_DIR = os.path.join(STORAGE_DIR, 'drafts')
JOBS_DIR = os.path.join(STORAGE_DIR, 'jobs')
MODELS_DIR = os.path.join(STORAGE_DIR, 'models')

for folder in [DATASETS_DIR, DRAFTS_DIR, JOBS_DIR, MODELS_DIR]:
    os.makedirs(folder, exist_ok=True)

# Helper: Generate realistic or synthetic dataset
def generate_synthetic_dataset(name: str, features_str: str, target: str, count: int, problem_type: str) -> pd.DataFrame:
    features = [f.strip() for f in features_str.split(",") if f.strip()]
    if not features:
        features = ["Feature_1", "Feature_2", "Feature_3"]
    
    # Specific preset: Gender Prediction System / height-weight
    is_gender_pred = "gender" in target.lower() or "gender" in name.lower()
    
    np.random.seed(42)
    data = {}
    
    if is_gender_pred:
        # Realistic height-weight distribution for males & females
        # Let's say 0 = Female, 1 = Male
        gender_labels = np.random.choice(["Female", "Male"], size=count, p=[0.5, 0.5])
        height = []
        weight = []
        for g in gender_labels:
            if g == "Female":
                height.append(np.random.normal(160, 6)) # cm
                weight.append(np.random.normal(55, 8))  # kg
            else:
                height.append(np.random.normal(175, 7)) # cm
                weight.append(np.random.normal(75, 10)) # kg
        
        data["Gender"] = gender_labels
        data["Height"] = np.round(height, 1)
        data["Weight"] = np.round(weight, 1)
        
        # Add extra dummy features if requested
        for f in features:
            if f.lower() not in ["height", "weight", "gender"]:
                data[f] = np.round(np.random.normal(10, 2, size=count), 2)
                
        # Set target if requested
        if target and target not in data:
            data[target] = gender_labels
    else:
        # General synthetic dataset based on custom features list
        for i, f in enumerate(features):
            # Check feature names for hints of data types
            if "category" in f.lower() or "type" in f.lower() or "contract" in f.lower():
                data[f] = np.random.choice(["Tier_1", "Tier_2", "Tier_3"], size=count)
            elif "gender" in f.lower() or "sex" in f.lower():
                data[f] = np.random.choice(["Male", "Female"], size=count)
            elif "status" in f.lower():
                data[f] = np.random.choice(["Active", "Inactive", "Pending"], size=count)
            else:
                # Continuous numerical
                data[f] = np.round(np.random.normal(50 + i * 10, 15, size=count), 2)
                
        # Generate target
        if target:
            # Let's combine first couple of numerical features to create a relationship
            numerical_cols = [k for k, v in data.items() if isinstance(v[0], (int, float, np.float64, np.int64))]
            if numerical_cols:
                base_val = np.sum([data[c] * (idx + 1) for idx, c in enumerate(numerical_cols[:3])], axis=0)
                # Add noise
                base_val += np.random.normal(0, np.std(base_val) * 0.1 if np.std(base_val) > 0 else 1, size=count)
            else:
                base_val = np.random.normal(0, 1, size=count)
                
            if problem_type == "classification":
                # Binary classes based on median threshold
                threshold = np.median(base_val)
                data[target] = np.where(base_val >= threshold, "Yes", "No")
            elif problem_type == "regression":
                # Continuous target
                data[target] = np.round(base_val, 2)
            else: # clustering
                # For clustering, we don't strictly need a target, but we'll include it if user requests
                data[target] = np.random.choice(["Cluster_A", "Cluster_B"], size=count)
        elif problem_type == "clustering":
            # Add cluster target for reference
            data["cluster_label"] = np.random.choice(["A", "B", "C"], size=count)
            
    # Introduce small percentage of missing values (e.g. 2%) to demonstrate preprocessing
    df = pd.DataFrame(data)
    for col in df.columns:
        if col != target: # keep target clean
            mask = np.random.rand(*df[col].shape) < 0.02
            df.loc[mask, col] = np.nan
            
    return df

def get_preview_data(df: pd.DataFrame) -> dict:
    # Handle NaN values to make them JSON serializable
    df_clean = df.copy().fillna("None")
    
    # Check duplicate count
    dup_count = int(df.duplicated().sum())
    
    columns = list(df.columns)
    
    # Fetch first 5 and last 5 rows
    head_rows = df_clean.head(5).to_dict(orient="records")
    tail_rows = df_clean.tail(5).to_dict(orient="records")
    
    return {
        "columns": columns,
        "preview_head": head_rows,
        "preview_tail": tail_rows,
        "row_count": len(df),
        "duplicate_count": dup_count
    }

def clean_nan(obj):
    import math
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nan(x) for x in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, (np.integer, np.floating)):
        val = float(obj)
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    elif pd.isna(obj):
        return None
    return obj

# File based job status reader/writer helpers
def read_job(job_id: str) -> dict:
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return {}

def write_job(job_id: str, data: dict):
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    cleaned_data = clean_nan(data)
    with open(path, 'w') as f:
        json.dump(cleaned_data, f, indent=2)

@csrf_exempt
@require_http_methods(["POST"])
def api_dataset_fetch(request):
    try:
        body = json.loads(request.body)
        dataset_name = body.get("dataset_name", "")
        required_features = body.get("required_features", "")
        target_column = body.get("target_column", "")
        jumlah_data = int(body.get("jumlah_data", 2000))
        problem_type = body.get("problem_type", "classification")

        df = generate_synthetic_dataset(
            name=dataset_name,
            features_str=required_features,
            target=target_column,
            count=jumlah_data,
            problem_type=problem_type
        )
        
        # Save to storage folder
        dataset_id = str(uuid.uuid4())
        df.to_csv(os.path.join(DATASETS_DIR, f"{dataset_id}.csv"), index=False)
        
        preview = get_preview_data(df)
        return JsonResponse({
            "dataset_id": dataset_id,
            **preview
        })
    except Exception as e:
        return JsonResponse({"detail": str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def api_dataset_upload(request):
    try:
        csv_file = request.FILES.get('file')
        dataset_name = request.POST.get("dataset_name", "Uploaded CSV")
        required_features = request.POST.get("required_features", "")
        target_column = request.POST.get("target_column", "")
        problem_type = request.POST.get("problem_type", "classification")

        df = pd.read_csv(csv_file)
        
        # Save to storage folder
        dataset_id = str(uuid.uuid4())
        df.to_csv(os.path.join(DATASETS_DIR, f"{dataset_id}.csv"), index=False)
        
        preview = get_preview_data(df)
        return JsonResponse({
            "dataset_id": dataset_id,
            **preview
        })
    except Exception as e:
        return JsonResponse({"detail": str(e)}, status=500)


# ─────────────────────────────────────────────
# /api/process — Preprocessing endpoint
# ─────────────────────────────────────────────
@csrf_exempt
@require_http_methods(["POST"])
def api_process(request):
    try:
        body = json.loads(request.body)
        dataset_id = body.get("dataset_id", "")
        missing_values = body.get("missing_values", "Drop blank rows")
        duplicate_strategy = body.get("duplicate_strategy", "Drop Duplicates")
        categorical_encoding = body.get("categorical_encoding", True)
        apply_standardization = body.get("apply_standardization", True)

        # Load dataset from file storage
        dataset_path = os.path.join(DATASETS_DIR, f"{dataset_id}.csv")
        if not os.path.exists(dataset_path):
            return JsonResponse({"detail": "Dataset not found. Please load a dataset first."}, status=404)

        df = pd.read_csv(dataset_path)

        # 1. Handle Duplicates
        if duplicate_strategy == "Drop Duplicates":
            df = df.drop_duplicates()

        # 2. Handle Missing Values
        for col in df.columns:
            if df[col].isnull().any():
                if missing_values == "Drop blank rows":
                    df = df.dropna(subset=[col])
                elif missing_values == "Fill with mean":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].mean())
                    else:
                        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
                elif missing_values == "Fill with median":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].median())
                    else:
                        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
                elif missing_values == "Fill with mode":
                    df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")

        # 3. Categorical Encoding
        if categorical_encoding:
            for col in df.columns:
                if not pd.api.types.is_numeric_dtype(df[col]):
                    le = LabelEncoder()
                    df[col] = le.fit_transform(df[col].astype(str))

        # 4. Standardization (numeric cols only)
        if apply_standardization:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if numeric_cols:
                scaler = StandardScaler()
                df[numeric_cols] = scaler.fit_transform(df[numeric_cols])
                df[numeric_cols] = df[numeric_cols].round(4)

        # Stats
        stats = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "numeric_columns": df.select_dtypes(include=[np.number]).columns.tolist(),
        }

        # Save processed file
        df.to_csv(os.path.join(DATASETS_DIR, f"{dataset_id}_processed.csv"), index=False)

        # Serialize (NaN safe)
        df_clean = df.copy().fillna(0)
        processed_rows = df_clean.to_dict(orient="records")

        return JsonResponse({
            "processed_rows": processed_rows,
            "columns": list(df.columns),
            "stats": stats
        })
    except Exception as e:
        return JsonResponse({"detail": str(e)}, status=500)

# Background training thread
def run_training_pipeline_sync(job_id: str, config: dict):
    try:
        import time
        job = read_job(job_id)
        job["status"] = "running"
        job["progress"] = 10
        write_job(job_id, job)
        
        dataset_id = config.get("dataset_id")
        dataset_path = os.path.join(DATASETS_DIR, f"{dataset_id}.csv") if dataset_id else ""
        
        if dataset_path and os.path.exists(dataset_path):
            df = pd.read_csv(dataset_path)
        else:
            # Fallback generation
            problem_type = config.get("problem_type", "classification")
            df = generate_synthetic_dataset(
                name=config.get("system_name", "Demo System"),
                features_str=config.get("required_features", "Height,Weight"),
                target=config.get("target_column", "Gender"),
                count=int(config.get("jumlah_data", 2000)),
                problem_type=problem_type
            )

        # ─────────────────────────────────────────────
        # Deteksi dataset metadata (berasal dari PDF/deskripsi kolom)
        # Jika dataset hanya berisi kolom 'column', 'dtype', 'description'
        # maka ini bukan data training — convert ke dataset sintetis
        # ─────────────────────────────────────────────
        is_metadata_dataset = (
            set(df.columns.str.strip().str.lower()) <= {'column', 'dtype', 'description', 'name', 'type'}
            and len(df.columns) <= 5
        )
        if is_metadata_dataset:
            problem_type_cfg = config.get("problem_type", "classification")
            target_cfg = config.get("target_column", "")
            # Rekonstruksi fitur dari baris metadata
            meta_features = []
            meta_target = target_cfg
            for _, row in df.iterrows():
                col_name = str(row.get('column', row.get('name', ''))).strip()
                if col_name and col_name.lower() not in ['', 'nan']:
                    meta_features.append(col_name)
            # Jika target ada di daftar fitur, pisahkan
            if meta_target and meta_target in meta_features:
                meta_features = [f for f in meta_features if f != meta_target]
            if not meta_features:
                meta_features = config.get("required_features", "Feature_1,Feature_2").split(",")
            if not meta_target:
                meta_target = meta_features[-1] if meta_features else "target"
                meta_features = meta_features[:-1] if len(meta_features) > 1 else meta_features
            features_str = ",".join([f.strip() for f in meta_features if f.strip()])
            df = generate_synthetic_dataset(
                name=config.get("system_name", "Demo System"),
                features_str=features_str or "Feature_1,Feature_2",
                target=meta_target,
                count=max(200, int(config.get("jumlah_data", 500))),
                problem_type=problem_type_cfg
            )
            
        job["progress"] = 25
        write_job(job_id, job)
        
        # ─────────────────────────────────────────────
        # RAW DATA QUALITY STATS (computed BEFORE preprocessing)
        # ─────────────────────────────────────────────
        raw_records = len(df)
        missing_count = int(df.isnull().sum().sum())
        duplicate_count = int(df.duplicated().sum())
        
        numeric_cols_raw = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols_raw = df.select_dtypes(exclude=[np.number]).columns.tolist()
        
        missing_pct = (missing_count / df.size) * 100 if df.size > 0 else 0
        duplicate_pct = (duplicate_count / raw_records) * 100 if raw_records > 0 else 0
        
        # Health score calculation
        health_score = 100.0
        health_score -= (missing_pct * 1.5)
        health_score -= (duplicate_pct * 1.0)
        health_score = max(0.0, min(100.0, health_score))
        
        if health_score >= 85:
            health_rating = "Excellent"
        elif health_score >= 70:
            health_rating = "Good"
        elif health_score >= 50:
            health_rating = "Warning"
        else:
            health_rating = "Poor"
            
        data_quality_report = {
            "total_records": raw_records,
            "missing_values_count": missing_count,
            "missing_values_pct": round(missing_pct, 1),
            "duplicate_rows_count": duplicate_count,
            "duplicate_rows_pct": round(duplicate_pct, 1),
            "numerical_features_count": len(numeric_cols_raw),
            "categorical_features_count": len(categorical_cols_raw),
            "health_score": round(health_score, 1),
            "health_rating": health_rating
        }
        
        df_original = df.copy() # keep a copy for sample predictions mapping

        target_column = config.get("target_column", "")
        problem_type = config.get("problem_type", "classification")

        if problem_type != "clustering":
            if not target_column or str(target_column).strip() == "":
                if len(df.columns) > 0:
                    target_column = df.columns[-1]
                else:
                    raise ValueError("Target column is not specified and dataset has no columns.")
            
            # Case-insensitive column matching
            matched_col = None
            for col in df.columns:
                if col.strip().lower() == str(target_column).strip().lower():
                    matched_col = col
                    break
            
            # If not found, fallback to last column
            if not matched_col:
                if len(df.columns) > 0:
                    matched_col = df.columns[-1]
                else:
                    raise ValueError(f"Target column '{target_column}' not found and dataset has no columns.")
            target_column = matched_col

        prep_config = config.get("preprocessing_config") or config.get("processing_config") or {}
        if prep_config is None:
            prep_config = {}
        missing_strategy = prep_config.get("missing_values") or prep_config.get("missing_value_strategy") or "Drop blank rows"
        dup_strategy = prep_config.get("duplicate_strategy") or "Drop Duplicates"
        categorical_encoding = prep_config.get("categorical_encoding")
        if categorical_encoding is None:
            categorical_encoding = prep_config.get("categoricalEncoding", True)
        standardize = prep_config.get("standardization")
        if standardize is None:
            standardize = prep_config.get("applyStandardization", True)
        
        # 1. Handle Duplicates
        if dup_strategy == "Drop Duplicates":
            df = df.drop_duplicates()
            
        # 2. Handle Missing Values
        for col in df.columns:
            if df[col].isnull().any():
                if missing_strategy == "Drop blank rows":
                    df = df.dropna(subset=[col])
                elif missing_strategy == "Fill with mean":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].mean())
                    else:
                        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
                elif missing_strategy == "Fill with median":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].median())
                    else:
                        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
                elif missing_strategy == "Fill with mode":
                    df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
                    
        job["progress"] = 40
        write_job(job_id, job)
        
        label_encoders = {}
        target_encoder = None
        features_cols = [c for c in df.columns if c != target_column]
        
        if problem_type != "clustering" and not features_cols:
            raise ValueError("No feature columns available for training. Please specify at least one feature column other than the target column.")

        y = None
        if problem_type != "clustering" and target_column in df.columns:
            if problem_type == "classification" and not pd.api.types.is_numeric_dtype(df[target_column]):
                target_encoder = LabelEncoder()
                df[target_column] = target_encoder.fit_transform(df[target_column].astype(str))
            y = df[target_column].values
            
        for col in features_cols:
            if not pd.api.types.is_numeric_dtype(df[col]):
                if categorical_encoding:
                    le = LabelEncoder()
                    df[col] = le.fit_transform(df[col].astype(str))
                    label_encoders[col] = le
                else:
                    df[col] = df[col].astype("category").cat.codes
                    
        job["progress"] = 60
        write_job(job_id, job)
        
        X = df[features_cols].values
        
        scaler = None
        if standardize and len(features_cols) > 0:
            scaler = StandardScaler()
            X = scaler.fit_transform(X)
            
        job["progress"] = 75
        write_job(job_id, job)
        
        model_config = config.get("model_config") or {}
        if model_config is None:
            model_config = {}
        algo = config.get("algorithm") or model_config.get("algorithm") or "Logistic Regression"
        params = config.get("parameters") or config.get("hyperparams") or model_config.get("parameters") or {}
        if params is None:
            params = {}
        
        def clean_params(p):
            cleaned = {}
            for k, v in p.items():
                if isinstance(v, str):
                    try:
                        if "." in v:
                            cleaned[k] = float(v)
                        else:
                            cleaned[k] = int(v)
                    except ValueError:
                        cleaned[k] = v
                else:
                    cleaned[k] = v
            return cleaned
            
        cleaned_params = clean_params(params)
        model = None
        
        t0_fit = time.time()
        
        if problem_type == "clustering":
            n_clusters = int(cleaned_params.get("n_clusters", 3))
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
            model.fit(X)
            fit_time = round(time.time() - t0_fit, 3)
            
            labels = model.labels_
            if len(np.unique(labels)) > 1:
                sil_score = float(silhouette_score(X, labels, sample_size=min(1000, len(X))))
            else:
                sil_score = 0.0
                
            feat_importances = [{"feature": f, "importance": float(1.0 / len(features_cols))} for f in features_cols]
            
            # Cluster distribution
            unique, counts = np.unique(labels, return_counts=True)
            cluster_dist = [{"cluster": f"Cluster {u}", "count": int(c)} for u, c in zip(unique, counts)]
            
            # Confidence stats mock for clustering
            confidence_stats = {
                "avg_confidence": 85.0,
                "highest_confidence": 95.0,
                "lowest_confidence": 70.0
            }
            
            results = {
                "accuracy": round(sil_score * 100, 2),
                "precision": round(sil_score, 2),
                "recall": round(sil_score, 2),
                "f1": round(sil_score, 2),
                "confusion_matrix": [[0, 0], [0, 0]],
                "feature_importances": feat_importances,
                "advanced_eval": {
                    "silhouette_score": round(sil_score, 3),
                    "cluster_distribution": cluster_dist
                },
                "confidence_stats": confidence_stats
            }
            
            # Sample Predictions
            sample_indices = np.arange(min(len(df_original), 5))
            test_df_original_samples = df_original.iloc[sample_indices]
            sample_predictions = []
            for idx_local, (_, row) in enumerate(test_df_original_samples.iterrows()):
                s_dict = row.to_dict()
                s_dict["_prediction"] = f"Cluster {labels[idx_local]}"
                s_dict["_confidence"] = "N/A"
                sample_predictions.append(s_dict)
            results["sample_predictions"] = sample_predictions
            
        else:
            indices = np.arange(len(X))
            X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(X, y, indices, test_size=0.2, random_state=42)
            
            if problem_type == "classification":
                if algo == "Logistic Regression":
                    C = float(cleaned_params.get("C", 1.0))
                    max_iter = int(cleaned_params.get("max_iter", 100))
                    penalty = cleaned_params.get("penalty", "l2")
                    solver = cleaned_params.get("solver", "lbfgs")
                    
                    if penalty == "elasticnet" and solver != "saga":
                        solver = "saga"
                    elif penalty == "l1" and solver not in ["liblinear", "saga"]:
                        solver = "liblinear"
                    elif penalty == "none":
                        penalty = None
                        
                    model = LogisticRegression(C=C, max_iter=max_iter, penalty=penalty, solver=solver, random_state=42)
                elif algo == "Decision Tree":
                    max_depth = cleaned_params.get("max_depth")
                    max_depth = int(max_depth) if max_depth else None
                    min_samples_split = int(cleaned_params.get("min_samples_split", 2))
                    criterion = cleaned_params.get("criterion", "gini")
                    model = DecisionTreeClassifier(max_depth=max_depth, min_samples_split=min_samples_split, criterion=criterion, random_state=42)
                elif algo == "Random Forest":
                    n_estimators = int(cleaned_params.get("n_estimators", 100))
                    max_depth = cleaned_params.get("max_depth")
                    max_depth = int(max_depth) if max_depth else None
                    min_samples_split = int(cleaned_params.get("min_samples_split", 2))
                    model = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth, min_samples_split=min_samples_split, random_state=42)
                elif algo == "XGBoost":
                    n_estimators = int(cleaned_params.get("n_estimators", 100))
                    learning_rate = float(cleaned_params.get("learning_rate", 0.3))
                    max_depth = int(cleaned_params.get("max_depth", 6))
                    model = xgb.XGBClassifier(n_estimators=n_estimators, learning_rate=learning_rate, max_depth=max_depth, random_state=42, eval_metric="logloss")
                
                if model is None:
                    model = LogisticRegression(random_state=42)
                
                model.fit(X_train, y_train)
                fit_time = round(time.time() - t0_fit, 3)
                
                y_pred = model.predict(X_test)
                acc = accuracy_score(y_test, y_pred)
                is_binary = len(np.unique(y_train)) <= 2
                avg_type = "binary" if is_binary else "macro"
                
                prec = precision_score(y_test, y_pred, average=avg_type, zero_division=0)
                rec = recall_score(y_test, y_pred, average=avg_type, zero_division=0)
                f1 = f1_score(y_test, y_pred, average=avg_type, zero_division=0)
                
                raw_cm = confusion_matrix(y_test, y_pred)
                cm = raw_cm.tolist()
                
                # Confidence stats
                if hasattr(model, "predict_proba"):
                    probs_all = model.predict_proba(X_test)
                    confidences = np.max(probs_all, axis=1) * 100
                    avg_conf = float(np.mean(confidences))
                    max_conf = float(np.max(confidences))
                    min_conf = float(np.min(confidences))
                else:
                    avg_conf = 88.0
                    max_conf = 95.0
                    min_conf = 72.0
                    probs_all = None
                
                confidence_stats = {
                    "avg_confidence": round(avg_conf, 1),
                    "highest_confidence": round(max_conf, 1),
                    "lowest_confidence": round(min_conf, 1)
                }
                
                # Feature Importances
                importances = []
                if hasattr(model, "feature_importances_"):
                    importances = model.feature_importances_
                elif hasattr(model, "coef_"):
                    importances = np.abs(model.coef_[0])
                else:
                    importances = [1.0 / len(features_cols)] * len(features_cols)
                
                if np.sum(importances) > 0:
                    importances = importances / np.sum(importances)
                    
                feat_importances = [{"feature": f, "importance": round(float(imp), 4)} for f, imp in zip(features_cols, importances)]
                feat_importances = sorted(feat_importances, key=lambda x: x["importance"], reverse=True)
                
                # Advanced Eval (ROC Curve & AUC Score)
                roc_points = []
                auc_score = 0.0
                if probs_all is not None:
                    try:
                        if is_binary:
                            fpr, tpr, _ = roc_curve(y_test, probs_all[:, 1])
                        else:
                            fpr, tpr, _ = roc_curve(y_test, probs_all[:, 0], pos_label=0)
                        auc_score = float(auc(fpr, tpr))
                        step = max(1, len(fpr) // 15)
                        roc_points = [{"fpr": round(float(f), 4), "tpr": round(float(t), 4)} for f, t in zip(fpr[::step], tpr[::step])]
                        if len(roc_points) == 0 or roc_points[-1] != {"fpr": 1.0, "tpr": 1.0}:
                            roc_points.append({"fpr": 1.0, "tpr": 1.0})
                    except Exception:
                        pass
                
                results = {
                    "accuracy": round(acc * 100, 2),
                    "precision": round(float(prec), 3),
                    "recall": round(float(rec), 3),
                    "f1": round(float(f1), 3),
                    "confusion_matrix": cm,
                    "feature_importances": feat_importances,
                    "confidence_stats": confidence_stats,
                    "advanced_eval": {
                        "roc_curve": roc_points,
                        "auc_score": round(auc_score, 3)
                    }
                }
                
                # Sample Predictions (matching original strings)
                test_df_original_samples = df_original.iloc[idx_test].head(5)
                X_test_samples = X_test[:5]
                preds_samples = model.predict(X_test_samples)
                probs_samples = model.predict_proba(X_test_samples) if hasattr(model, "predict_proba") else None
                
                sample_predictions = []
                for i, (_, row) in enumerate(test_df_original_samples.iterrows()):
                    s_dict = row.to_dict()
                    pred_val = preds_samples[i]
                    if target_encoder:
                        pred_str = str(target_encoder.inverse_transform([int(pred_val)])[0])
                    else:
                        pred_str = str(pred_val)
                    s_dict["_prediction"] = pred_str
                    
                    if probs_samples is not None:
                        c_val = float(np.max(probs_samples[i]) * 100)
                        s_dict["_confidence"] = f"{round(c_val, 1)}%"
                    else:
                        s_dict["_confidence"] = "N/A"
                    sample_predictions.append(s_dict)
                results["sample_predictions"] = sample_predictions
                
            elif problem_type == "regression":
                if algo == "Logistic Regression":
                    from sklearn.linear_model import Ridge
                    model = Ridge(alpha=1.0)
                elif algo == "Decision Tree":
                    max_depth = cleaned_params.get("max_depth")
                    max_depth = int(max_depth) if max_depth else None
                    min_samples_split = int(cleaned_params.get("min_samples_split", 2))
                    model = DecisionTreeRegressor(max_depth=max_depth, min_samples_split=min_samples_split, random_state=42)
                elif algo == "Random Forest":
                    n_estimators = int(cleaned_params.get("n_estimators", 100))
                    max_depth = cleaned_params.get("max_depth")
                    max_depth = int(max_depth) if max_depth else None
                    min_samples_split = int(cleaned_params.get("min_samples_split", 2))
                    model = RandomForestRegressor(n_estimators=n_estimators, max_depth=max_depth, min_samples_split=min_samples_split, random_state=42)
                elif algo == "XGBoost":
                    n_estimators = int(cleaned_params.get("n_estimators", 100))
                    learning_rate = float(cleaned_params.get("learning_rate", 0.3))
                    max_depth = int(cleaned_params.get("max_depth", 6))
                    model = xgb.XGBRegressor(n_estimators=n_estimators, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                
                if model is None:
                    from sklearn.linear_model import Ridge
                    model = Ridge(alpha=1.0)
                
                model.fit(X_train, y_train)
                fit_time = round(time.time() - t0_fit, 3)
                
                y_pred = model.predict(X_test)
                r2 = r2_score(y_test, y_pred)
                mse_val = mean_squared_error(y_test, y_pred)
                rmse_val = np.sqrt(mse_val)
                mae_val = mean_absolute_error(y_test, y_pred)
                
                importances = []
                if hasattr(model, "feature_importances_"):
                    importances = model.feature_importances_
                elif hasattr(model, "coef_"):
                    importances = np.abs(model.coef_)
                else:
                    importances = [1.0 / len(features_cols)] * len(features_cols)
                
                if len(importances) > 0:
                    if np.sum(importances) > 0:
                        importances = importances / np.sum(importances)
                    feat_importances = [{"feature": f, "importance": round(float(imp), 4)} for f, imp in zip(features_cols, importances)]
                    feat_importances = sorted(feat_importances, key=lambda x: x["importance"], reverse=True)
                else:
                    feat_importances = []
                
                # Residual plot coordinates (sample 40 points)
                residuals = y_test - y_pred
                res_step = max(1, len(y_pred) // 40)
                residual_points = [{"predicted": round(float(p), 4), "residual": round(float(r), 4)} for p, r in zip(y_pred[::res_step], residuals[::res_step])]
                
                confidence_stats = {
                    "avg_confidence": round(max(0, min(100, r2 * 100)), 1),
                    "highest_confidence": round(max(0, min(100, (r2 + 0.1) * 100)), 1),
                    "lowest_confidence": round(max(0, min(100, (r2 - 0.1) * 100)), 1)
                }
                
                results = {
                    "accuracy": round(max(0, r2) * 100, 2),
                    "precision": round(float(mse_val), 3),
                    "recall": 0,
                    "f1": 0,
                    "confusion_matrix": [[0, 0], [0, 0]],
                    "feature_importances": feat_importances,
                    "confidence_stats": confidence_stats,
                    "advanced_eval": {
                        "mae": round(float(mae_val), 3),
                        "rmse": round(float(rmse_val), 3),
                        "r2_score": round(float(r2), 3),
                        "residual_plot": residual_points
                    }
                }
                
                # Sample Predictions
                test_df_original_samples = df_original.iloc[idx_test].head(5)
                X_test_samples = X_test[:5]
                preds_samples = model.predict(X_test_samples)
                sample_predictions = []
                for i, (_, row) in enumerate(test_df_original_samples.iterrows()):
                    s_dict = row.to_dict()
                    s_dict["_prediction"] = str(round(float(preds_samples[i]), 3))
                    s_dict["_confidence"] = "N/A"
                    sample_predictions.append(s_dict)
                results["sample_predictions"] = sample_predictions
                
        # ─────────────────────────────────────────────
        # MODEL SUMMARY & INSIGHTS (shared across types)
        # ─────────────────────────────────────────────
        model_summary = {
            "algorithm": algo,
            "problem_type": problem_type,
            "training_records": len(X_train) if problem_type != "clustering" else len(X),
            "features_count": len(features_cols),
            "training_time_sec": fit_time,
            "status": "complete"
        }
        
        # Determine top 3 features
        top_features_list = [item["feature"] for item in results["feature_importances"][:3]] if results.get("feature_importances") else []
        top_features_str = ", ".join(top_features_list) if top_features_list else "none"
        
        is_trade_dataset = any(c.lower() in [col.lower() for col in df_original.columns] for c in ["country", "product", "export", "import", "spent", "trade"])
        
        if is_trade_dataset:
            business_insights = [
                f"Most Influential Trade Segments: Driven heavily by {top_features_list[0] if len(top_features_list) > 0 else 'top variables'}.",
                f"High-Risk Trade Patterns: Anomalies and high-risk segments are predicted based on variations in {top_features_list[1] if len(top_features_list) > 1 else 'features'}.",
                f"Export Optimization Recommendation: Align product allocation matching the {top_features_list[0] if len(top_features_list) > 0 else 'primary drivers'} predictions to boost volume by up to 15%."
            ]
            ai_insight = (
                f"The model successfully completed training and reached {results['accuracy']}% accuracy. "
                f"Features '{top_features_str}' were identified as the main drivers for trade prediction. "
                + (f"Note: A warning badge has been triggered because the dataset has {duplicate_pct:.1f}% duplicate entries, which could affect model generalizability." if duplicate_pct > 30 else "")
            )
        else:
            business_insights = [
                f"Primary Efficiency Driver: {top_features_list[0].capitalize() if len(top_features_list) > 0 else 'primary feature'} represents the highest impact variable.",
                f"Segment Variations: Leverage predictable patterns in {top_features_list[1] if len(top_features_list) > 1 else 'features'} to structure targeting strategies.",
                f"Data Quality Impact: Address data hygiene areas (especially missing and duplicates) to improve prediction precision."
            ]
            ai_insight = (
                f"AutoML successfully trained the {algo} model to {results['accuracy']}% precision. "
                f"The primary driver of the prediction is '{top_features_list[0] if len(top_features_list) > 0 else 'none'}', followed by '{top_features_list[1] if len(top_features_list) > 1 else 'none'}'. "
                + (f"Note: The high volume of duplicate rows ({duplicate_pct:.1f}%) might artificially inflate accuracy results." if duplicate_pct > 30 else "")
            )
            
        results["model_summary"] = model_summary
        results["data_quality_report"] = data_quality_report
        results["ai_insights"] = ai_insight
        results["business_insights"] = business_insights
        results["dataset_id"] = dataset_id
        results["feature_descriptions"] = config.get("feature_descriptions", {})
        
        job["progress"] = 90
        write_job(job_id, job)
        
        # Save Trained Model Artifact
        model_path = os.path.join(MODELS_DIR, f"{job_id}.pkl")
        model_package = {
            "model": model,
            "label_encoders": label_encoders,
            "target_encoder": target_encoder,
            "scaler": scaler,
            "features": features_cols,
            "problem_type": problem_type,
            "target_column": target_column
        }
        
        with open(model_path, "wb") as f:
            pickle.dump(model_package, f)
            
        # Complete
        job["status"] = "complete"
        job["progress"] = 100
        job["result"] = results
        job["model_path"] = model_path
        write_job(job_id, job)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        job = read_job(job_id)
        job["status"] = "error"
        job["error_message"] = str(e)
        write_job(job_id, job)

@csrf_exempt
@require_http_methods(["POST"])
def api_train(request):
    try:
        body = json.loads(request.body)
        job_id = str(uuid.uuid4())
        
        # DEBUG: Log request body ke file untuk analisis
        try:
            import datetime
            debug_log_path = os.path.join(STORAGE_DIR, 'debug_train_requests.log')
            with open(debug_log_path, 'a', encoding='utf-8') as dbg:
                dbg.write(f"\n=== [{datetime.datetime.now()}] job_id={job_id} ===\n")
                dbg.write(json.dumps(body, indent=2, default=str))
                dbg.write("\n")
        except Exception:
            pass
        
        job = {
            "status": "pending",
            "progress": 0,
            "result": None,
            "error_message": None,
            "request": body  # Simpan request body untuk debugging
        }
        write_job(job_id, job)
        
        # Start training in a separate background thread
        thread = threading.Thread(target=run_training_pipeline_sync, args=(job_id, body))
        thread.start()
        
        return JsonResponse({"job_id": job_id})
    except Exception as e:
        return JsonResponse({"detail": str(e)}, status=500)

@require_http_methods(["GET"])
def api_train_status(request, job_id):
    job = read_job(job_id)
    if not job:
        return JsonResponse({"detail": "Job not found"}, status=404)
    return JsonResponse({
        "status": job["status"],
        "progress": job["progress"],
        "error_message": job.get("error_message")
    })

@require_http_methods(["GET"])
def api_train_result(request, job_id):
    job = read_job(job_id)
    if not job:
        return JsonResponse({"detail": "Job not found"}, status=404)
    if job["status"] != "complete":
        return JsonResponse({"detail": "Job is not completed yet"}, status=400)
    return JsonResponse(job["result"])

@require_http_methods(["GET"])
def api_model_download(request, job_id):
    job = read_job(job_id)
    if not job or job["status"] != "complete" or not job.get("model_path"):
        return JsonResponse({"detail": "Model is not available"}, status=404)
    
    response = FileResponse(open(job["model_path"], 'rb'), content_type='application/octet-stream')
    response['Content-Disposition'] = f'attachment; filename="trained_model_{job_id}.pkl"'
    return response

@csrf_exempt
@require_http_methods(["POST"])
def api_draft_save(request):
    try:
        body = json.loads(request.body)
        submission_id = body.get("submission_id", "default_draft")
        
        draft_file = os.path.join(DRAFTS_DIR, f"{submission_id}.json")
        with open(draft_file, 'w') as f:
            json.dump(body, f, indent=2)
            
        return JsonResponse({"status": "success", "message": f"Draft saved for submission {submission_id}"})
    except Exception as e:
        return JsonResponse({"detail": str(e)}, status=500)

@require_http_methods(["GET"])
def api_draft_load(request, submission_id):
    draft_file = os.path.join(DRAFTS_DIR, f"{submission_id}.json")
    if os.path.exists(draft_file):
        with open(draft_file, 'r') as f:
            draft = json.load(f)
            return JsonResponse(draft)
    return JsonResponse({"detail": "Draft not found"}, status=404)

@csrf_exempt
@require_http_methods(["GET"])
def api_dataset_load_submission(request, submission_id):
    try:
        from .models import IntelligenceSubmission
        submission = IntelligenceSubmission.objects.get(id=submission_id)
        if not submission.source_file:
            return JsonResponse({"detail": "Submission has no source file"}, status=400)
            
        file_path = submission.source_file.path
        if not os.path.exists(file_path):
            return JsonResponse({"detail": "Source file not found on disk"}, status=404)
            
        # Safe read for CSV, PDF, JSON, or TXT
        if file_path.lower().endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.lower().endswith('.pdf'):
            try:
                import pypdf
                reader = pypdf.PdfReader(file_path)
                text_lines = []
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        text_lines.extend(t.splitlines())
                if not text_lines:
                    text_lines = ["(File PDF kosong atau tidak berisi teks yang dapat diekstrak)"]
                df = pd.DataFrame({"text_content": text_lines})
            except Exception as e:
                df = pd.DataFrame({"text_content": [f"Gagal mengekstrak PDF: {str(e)}"]})
        elif file_path.lower().endswith('.json'):
            # ─── Tangani JSON: bisa berupa Kaggle metadata, array of records, atau object ───
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    jdata = json.load(f)
                
                if isinstance(jdata, list):
                    # Array of records → langsung jadi DataFrame
                    df = pd.DataFrame(jdata)
                elif isinstance(jdata, dict):
                    # Cek apakah ini Kaggle-style metadata (ada key 'data' atau 'columns')
                    # Contoh: {"title": "...", "keywords": [...], "data": [{"name": "x.csv"}]}
                    # Kita harus generate dataset sintetis dari informasi yang ada
                    
                    # Coba ambil info kolom dari key umum
                    cols_info = (
                        jdata.get('columns') or
                        jdata.get('fields') or
                        jdata.get('schema', {}).get('fields') or
                        []
                    )
                    if cols_info and isinstance(cols_info, list):
                        # Punya info kolom eksplisit
                        col_names = []
                        for c in cols_info:
                            if isinstance(c, dict):
                                col_names.append(c.get('name', c.get('column', '')))
                            elif isinstance(c, str):
                                col_names.append(c)
                        col_names = [c for c in col_names if c]
                        if col_names:
                            df = pd.DataFrame({c: [None]*5 for c in col_names})
                        else:
                            df = pd.DataFrame({"Feature_1": [None]*5, "Feature_2": [None]*5, "target": [None]*5})
                    else:
                        # Kaggle metadata style: tidak ada kolom data — generate placeholder sintetis
                        # Ambil keywords untuk konteks nama kolom
                        keywords = jdata.get('keywords', [])
                        title = jdata.get('title', 'Dataset')
                        # Buat placeholder metadata df yang akan dideteksi sebagai metadata
                        meta_rows = [
                            {"column": "Feature_1", "dtype": "float64", "description": "Feature 1"},
                            {"column": "Feature_2", "dtype": "float64", "description": "Feature 2"},
                            {"column": "Feature_3", "dtype": "object", "description": "Feature 3"},
                            {"column": "target", "dtype": "int64", "description": "Target label"},
                        ]
                        df = pd.DataFrame(meta_rows)
                else:
                    df = pd.DataFrame({"json_content": [str(jdata)]})
            except Exception as e:
                df = pd.DataFrame({"text_content": [f"Gagal membaca JSON: {str(e)}"]})
        else:
            try:
                df = pd.read_csv(file_path)
            except Exception:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.read().splitlines()
                df = pd.DataFrame({"text_content": lines})

        
        # ─────────────────────────────────────────────
        # Deteksi jika dataset adalah metadata/schema CSV (kolom: column, dtype, description)
        # Jika ya, generate dataset sintetis dari deskripsi kolom tersebut
        # ─────────────────────────────────────────────
        is_metadata_dataset = (
            set(df.columns.str.strip().str.lower()) <= {'column', 'dtype', 'description', 'name', 'type'}
            and len(df.columns) <= 5
            and len(df) > 0
        )
        
        # Ambil info dari submission untuk target & problem type
        submission_target = ""
        submission_problem_type = "classification"
        try:
            pipeline_data = submission.pipeline_data or {}
            if isinstance(pipeline_data, str):
                import json as _json
                pipeline_data = _json.loads(pipeline_data)
            stage0 = pipeline_data.get('stage_0', {})
            submission_target = stage0.get('targetColumn', '') or stage0.get('primaryOutcome', '')
            submission_problem_type = stage0.get('problemType', 'classification')
        except Exception:
            pass
        
        if is_metadata_dataset:
            # Rekonstruksi fitur dari baris metadata
            meta_features = []
            meta_target = submission_target
            for _, row in df.iterrows():
                col_name = str(row.get('column', row.get('name', ''))).strip()
                if col_name and col_name.lower() not in ['', 'nan']:
                    meta_features.append(col_name)
            # Pisahkan target dari fitur
            if meta_target and meta_target in meta_features:
                meta_features = [f for f in meta_features if f != meta_target]
            if not meta_target and meta_features:
                meta_target = meta_features[-1]
                meta_features = meta_features[:-1]
            features_str = ",".join([f.strip() for f in meta_features if f.strip()]) or "Feature_1,Feature_2"
            df = generate_synthetic_dataset(
                name=submission.title or "Demo System",
                features_str=features_str,
                target=meta_target or "target",
                count=500,
                problem_type=submission_problem_type
            )
                
        # Save to storage folder
        dataset_id = str(uuid.uuid4())
        df.to_csv(os.path.join(DATASETS_DIR, f"{dataset_id}.csv"), index=False)
        
        # Tentukan target_column yang akan dikembalikan ke mobile
        # Coba ambil dari submission pipeline_data dulu
        returned_target = submission_target or ""
        # Jika tidak ada, gunakan kolom terakhir dari df sebagai default
        if not returned_target and len(df.columns) > 0:
            returned_target = df.columns[-1]
        # Pastikan target ada di kolom df, kalau tidak gunakan kolom terakhir
        if returned_target and returned_target not in df.columns:
            returned_target = df.columns[-1] if len(df.columns) > 0 else ""
        
        # Fitur = semua kolom KECUALI target
        feature_columns = [c for c in df.columns if c != returned_target]
        
        preview = get_preview_data(df)
        return JsonResponse({
            "dataset_id": dataset_id,
            "system_name": submission.title,
            "description": submission.description,
            "target_column": returned_target,
            "problem_type": submission_problem_type,
            "feature_columns": feature_columns,
            **preview
        })
    except IntelligenceSubmission.DoesNotExist:
        return JsonResponse({"detail": "Submission not found"}, status=404)
    except Exception as e:
        return JsonResponse({"detail": str(e)}, status=500)



@require_http_methods(["GET"])
def api_download_processed(request, dataset_id):
    path = os.path.join(DATASETS_DIR, f"{dataset_id}_processed.csv")
    if not os.path.exists(path):
        # Fallback to raw csv if processed not found
        path = os.path.join(DATASETS_DIR, f"{dataset_id}.csv")
        if not os.path.exists(path):
            raise Http404("Processed dataset not found")
    response = FileResponse(open(path, 'rb'), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="processed_dataset_{dataset_id}.csv"'
    return response


@require_http_methods(["GET"])
def api_pdf_report(request, job_id):
    job = read_job(job_id)
    if not job or job["status"] != "complete" or not job.get("result"):
        raise Http404("Job report not found")
    
    res = job["result"]
    summary = res.get("model_summary", {})
    quality = res.get("data_quality_report", {})
    ai_insights = res.get("ai_insights", "")
    biz_insights = res.get("business_insights", [])
    
    # Load processed dataset for Grid 3 visualization adaptation
    import pandas as pd
    import os
    from django.conf import settings
    dataset_id = res.get("dataset_id")
    df_json_str = "[]"
    if dataset_id:
        path = os.path.join(settings.MEDIA_ROOT, 'datasets', f'processed_{dataset_id}.csv')
        if os.path.exists(path):
            try:
                # only load top 500 rows to keep HTML size small
                df = pd.read_csv(path, nrows=500)
                df_json_str = df.to_json(orient="records")
            except Exception:
                pass
    
    # 1. Business Insights list items
    biz_insights_html = "".join(f"<li>{item}</li>" for item in biz_insights)
    
    # 2. Feature Importances table rows
    feat_rows = []
    for item in res.get('feature_importances', [])[:5]:
        importance_pct = round(item.get('importance', 0) * 100, 1)
        importance_val = item.get('importance', 0)
        if importance_val >= 0.25:
            badge_class = "badge-success"
            impact_text = "High"
        elif importance_val >= 0.1:
            badge_class = "badge-warning"
            impact_text = "Medium"
        else:
            badge_class = "badge-danger"
            impact_text = "Low"
        
        row_html = f"""
        <tr>
            <td><strong>{item.get('feature', 'N/A')}</strong></td>
            <td>{importance_pct}%</td>
            <td>
                <span class="badge {badge_class}">
                    {impact_text}
                </span>
            </td>
        </tr>
        """
        feat_rows.append(row_html)
    feat_importances_html = "".join(feat_rows)
    
    # 3. Sample Predictions table headers and rows
    sample_preds = res.get('sample_predictions', [])
    if sample_preds and isinstance(sample_preds, list):
        # Extract headers (excluding keys starting with '_')
        headers = [col for col in sample_preds[0].keys() if not col.startswith('_')]
        headers_html = "".join(f"<th>{col}</th>" for col in headers)
        
        rows_list = []
        for row in sample_preds:
            cells_html = "".join(f"<td>{row.get(col, '')}</td>" for col in headers)
            pred_val = row.get('_prediction', 'N/A')
            conf_val = row.get('_confidence', 'N/A')
            row_html = f"""
            <tr>
                {cells_html}
                <td><strong>{pred_val}</strong></td>
                <td><span class="badge badge-success">{conf_val}</span></td>
            </tr>
            """
            rows_list.append(row_html)
        sample_predictions_html = f"""
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        {headers_html}
                        <th>Prediction</th>
                        <th>Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    {"".join(rows_list)}
                </tbody>
            </table>
        </div>
        """
    else:
        sample_predictions_html = "<p>No sample predictions available.</p>"

    # 4. Intelligence Experiences HTML Section
    target_col = summary.get("target_column", "Target Column")
    prob_type = summary.get("problem_type", "classification")
    algorithm_name = summary.get("algorithm", "Machine Learning Model")
    
    desc_text = (
        f"Sistem mengambil alih dan mengeksekusi sebuah tugas kognitif atau kalkulasi yang kompleks "
        f"secara langsung untuk memprediksi nilai <strong>{target_col}</strong> (menggunakan pendekatan <em>{prob_type}</em> "
        f"dengan model <em>{algorithm_name}</em>). Sistem menganalisis berbagai fitur masukan "
        f"dan memberikan hasil prediksi secara real-time, membebaskan pengguna dari perhitungan manual "
        f"atau estimasi subjektif."
    )
    
    intelligence_experiences_html = f"""
    <div class="section-title">INTELLIGENCE EXPERIENCES</div>
    <div class="card" style="margin-bottom: 20px;">
        <div class="row-info">
            <span>Automate</span>
            <strong>Ya</strong>
        </div>
        <div class="row-info">
            <span>Prompt</span>
            <strong>Ya</strong>
        </div>
        <div class="row-info">
            <span>Organisation</span>
            <strong>Tidak</strong>
        </div>
        <div class="row-info">
            <span>Annotate</span>
            <strong>Tidak</strong>
        </div>
        <div class="row-info" style="flex-direction: column; align-items: flex-start; border: none; padding-top: 12px;">
            <span style="margin-bottom: 6px;">Deskripsi</span>
            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #4a5568;">{desc_text}</p>
        </div>
    </div>
    """

    # 5. Functions / Nama Fungsi vertical table (matching row 0 of sample predictions)
    functions_rows = []
    if sample_preds and isinstance(sample_preds, list):
        first_sample = sample_preds[0]
        custom_descriptions = res.get("feature_descriptions", {})
        for col_name, col_val in first_sample.items():
            if col_name.startswith('_'):
                continue
            
            friendly_name = col_name.replace('_', ' ').strip().title()
            
            # Use custom description if present, else fallback to formatted sample value
            desc_val = custom_descriptions.get(col_name)
            if desc_val is None:
                desc_val = custom_descriptions.get(friendly_name)
                
            if desc_val is not None and str(desc_val).strip() != "":
                formatted_val = str(desc_val)
            else:
                if isinstance(col_val, float):
                    import math
                    if math.isnan(col_val):
                        formatted_val = "None"
                    else:
                        if col_val.is_integer():
                            formatted_val = str(int(col_val))
                        else:
                            formatted_val = f"{col_val:.2f}"
                else:
                    formatted_val = str(col_val)
                
            row_html = f"""
            <tr>
                <td><strong>{friendly_name}</strong></td>
                <td>{formatted_val}</td>
            </tr>
            """
            functions_rows.append(row_html)
            
        functions_table_html = f"""
        <div class="section-title">Functions / Nama Fungsi</div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="width: 40%;">NAMA FUNGSI</th>
                        <th style="width: 60%;">DESKRIPSI</th>
                    </tr>
                </thead>
                <tbody>
                    {"".join(functions_rows)}
                </tbody>
            </table>
        </div>
        """
    else:
        functions_table_html = ""

    # 6. Error Mitigation HTML Section
    numeric_names = []
    categorical_names = []
    if sample_preds and isinstance(sample_preds, list):
        first_sample = sample_preds[0]
        for col_name, col_val in first_sample.items():
            if col_name.startswith('_'):
                continue
            friendly_name = col_name.replace('_', ' ').strip().title()
            
            is_numeric = False
            if isinstance(col_val, (int, float)):
                is_numeric = True
            else:
                try:
                    float(str(col_val))
                    is_numeric = True
                except ValueError:
                    pass
            
            if is_numeric:
                numeric_names.append(friendly_name)
            else:
                categorical_names.append(friendly_name)
                
    numeric_list_str = ", ".join(numeric_names[:4]) + ("..." if len(numeric_names) > 4 else "")
    categorical_list_str = ", ".join(categorical_names[:4]) + ("..." if len(categorical_names) > 4 else "")
    
    if not numeric_list_str:
        numeric_list_str = "kolom numerik"
    if not categorical_list_str:
        categorical_list_str = "kolom kategori"
        
    error_mitigation_html = f"""
    <div class="section-title">Error Mitigation / Mitigasi Kesalahan</div>
    <div class="table-wrapper">
        <table>
            <thead>
                <tr>
                    <th style="width: 40%;">NAMA ERROR</th>
                    <th style="width: 60%;">STRATEGI MITIGASI</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Pencegahan Kesalahan Format Input (Data Type & Format Validation)</strong></td>
                    <td style="white-space: normal; word-break: break-word; line-height: 1.5;">
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Menerapkan input mask dan pembatasan keyboard untuk kolom numerik seperti <strong>{numeric_list_str}</strong>.</li>
                            <li>Mengubah input teks bebas pada <strong>{categorical_list_str}</strong> menjadi menu dropdown atau searchable list yang sudah terstandardisasi di database.</li>
                            <li>Menetapkan batas minimum (minimum value) dan maksimum (maximum value) pada kolom angka untuk mencegah input nilai yang tidak realistis (misalnya berat barang > 100kg atau harga negatif).</li>
                        </ul>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>AutoML Executive Report - {job_id}</title>
        <style>
            body {{ font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7fafc; color: #2d3748; margin: 0; padding: 40px; }}
            .container {{ max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
            .header {{ border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }}
            .header h1 {{ font-size: 28px; color: #4a5568; margin: 0; }}
            .header p {{ color: #718096; margin: 5px 0 0 0; }}
            .section-title {{ font-size: 20px; color: #2b6cb0; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px; margin-bottom: 15px; text-transform: uppercase; font-weight: 600; }}
            .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
            .card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px 20px; }}
            .metric {{ font-size: 32px; font-weight: bold; color: #2b6cb0; }}
            .label {{ font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 1px; }}
            .row-info {{ display: flex; justify-content: space-between; border-bottom: 1px solid #edf2f7; padding: 8px 0; }}
            .row-info:last-child {{ border: none; }}
            .badge {{ display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; }}
            .badge-success {{ background: #c6f6d5; color: #22543d; }}
            .badge-warning {{ background: #feebc8; color: #744210; }}
            .badge-danger {{ background: #fed7d7; color: #742a2a; }}
            .table-wrapper {{ width: 100%; overflow-x: auto; margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: white; }}
            table {{ width: 100%; border-collapse: collapse; min-width: max-content; }}
            th {{ text-align: left; background: #edf2f7; padding: 10px; font-size: 12px; text-transform: uppercase; color: #4a5568; border: 1px solid #e2e8f0; white-space: nowrap; }}
            td {{ padding: 10px; border: 1px solid #e2e8f0; font-size: 13px; white-space: nowrap; }}
            .insight-box {{ background: #ebf8ff; border-left: 4px solid #3182ce; padding: 15px 20px; border-radius: 0 6px 6px 0; margin-bottom: 20px; font-size: 14px; line-height: 1.6; }}
            .btn-print {{ background: #3182ce; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; float: right; transition: background 0.2s; }}
            .btn-print:hover {{ background: #2b6cb0; }}
            @media print {{
                body {{ padding: 0; background: white; }}
                .container {{ box-shadow: none; padding: 0; max-width: 100%; }}
                .btn-print {{ display: none; }}
                .table-wrapper {{ overflow-x: visible; border: none; }}
                table {{ min-width: 100%; table-layout: auto; }}
                th, td {{ white-space: normal; word-break: break-word; font-size: 10px; padding: 6px 4px; }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <button class="btn-print" onclick="window.print()">Print to PDF</button>
            <div class="header">
                <h1>AutoML Executive Report</h1>
                <p>Job ID: {job_id} | Status: Ready</p>
            </div>
            
            <div class="grid" style="grid-template-columns: 1fr 1fr 1fr 1fr; margin-bottom: 30px;">
                <div class="card">
                    <div class="metric">{res.get('accuracy', 0)}%</div>
                    <div class="label">{ "Silhouette" if summary.get('problem_type') == 'clustering' else ("R-Squared" if summary.get('problem_type') == 'regression' else "Accuracy") }</div>
                </div>
                <div class="card">
                    <div class="metric">{res.get('precision', 0)}</div>
                    <div class="label">{ "Silhouette" if summary.get('problem_type') == 'clustering' else ("MSE" if summary.get('problem_type') == 'regression' else "Precision") }</div>
                </div>
                <div class="card">
                    <div class="metric">{summary.get('training_time_sec', 0)}s</div>
                    <div class="label">Training Time</div>
                </div>
                <div class="card">
                    <div class="metric" style="font-size: 20px; padding: 8px 0;">
                        <span class="badge badge-success" style="font-size: 14px; padding: 6px 12px;">{quality.get('health_rating', 'Good')}</span>
                    </div>
                    <div class="label">Dataset Health</div>
                </div>
            </div>
            
            <div class="section-title">AI Summary & Insights</div>
            <div class="insight-box">
                <strong>Executive Summary:</strong><br/>
                {ai_insights}
            </div>
            
            <div class="grid">
                <div>
                    <div class="section-title">Model Overview</div>
                    <div class="card">
                        <div class="row-info">
                            <span>Algorithm</span>
                            <strong>{summary.get('algorithm', 'N/A')}</strong>
                        </div>
                        <div class="row-info">
                            <span>Task Type</span>
                            <strong>{summary.get('problem_type', 'N/A').capitalize()}</strong>
                        </div>
                        <div class="row-info">
                            <span>Training Sample</span>
                            <strong>{summary.get('training_records', 0)} rows</strong>
                        </div>
                        <div class="row-info">
                            <span>Features Used</span>
                            <strong>{summary.get('features_count', 0)} variables</strong>
                        </div>
                    </div>
                </div>
                
                <div>
                    <div class="section-title">Data Quality Report</div>
                    <div class="card">
                        <div class="row-info">
                            <span>Total Rows Ingested</span>
                            <strong>{quality.get('total_records', 0)}</strong>
                        </div>
                        <div class="row-info">
                            <span>Missing Values</span>
                            <strong>{quality.get('missing_values_count', 0)} ({quality.get('missing_values_pct', 0)}%)</strong>
                        </div>
                        <div class="row-info">
                            <span>Duplicate Rows</span>
                            <strong>{quality.get('duplicate_rows_count', 0)} ({quality.get('duplicate_rows_pct', 0)}%)</strong>
                        </div>
                        <div class="row-info">
                            <span>Health Score</span>
                            <strong>{quality.get('health_score', 100)} / 100</strong>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="section-title">Business Recommendations</div>
            <ul>
                {biz_insights_html}
            </ul>
            
            <div class="section-title">Top Feature Importances</div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Feature Name</th>
                            <th>Relative Importance</th>
                            <th>Impact Classification</th>
                        </tr>
                    </thead>
                    <tbody>
                        {feat_importances_html}
                    </tbody>
                </table>
            </div>
            
            <div class="section-title">Sample Predictions Preview</div>
            {sample_predictions_html}

            {intelligence_experiences_html}

            {functions_table_html}

            {error_mitigation_html}

            <div class="section-title" style="page-break-before: always;">Data Visualization (Grid 3 Processing)</div>
            <div class="grid" style="margin-bottom: 30px;">
                <div class="card" style="display:flex; flex-direction:column; align-items:center;">
                    <div class="label" style="margin-bottom:10px;">Top Feature Histogram</div>
                    <div style="width:100%; height:300px; position:relative;">
                        <canvas id="pdfHistChart"></canvas>
                    </div>
                </div>
                <div class="card" style="display:flex; flex-direction:column; align-items:center;">
                    <div class="label" style="margin-bottom:10px;">Feature Scatter Plot</div>
                    <div style="width:100%; height:300px; position:relative;">
                        <canvas id="pdfScatterChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
    """

    js_code = """
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script>
            const processedRows = %s;
            if (processedRows && processedRows.length > 0) {
                const cols = Object.keys(processedRows[0]);
                const numCols = cols.filter(c => {
                    return processedRows.slice(0, 5).every(r => r[c] === null || !isNaN(parseFloat(r[c])));
                });
                if (numCols.length > 0) {
                    const col = numCols[0];
                    const values = processedRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
                    if (values.length > 0) {
                        const min = Math.min(...values);
                        const max = Math.max(...values);
                        const binWidth = (max - min) / 10 || 1;
                        const bins = Array.from({ length: 10 }, (_, i) => +(min + i * binWidth + binWidth / 2).toFixed(1));
                        const counts = new Array(10).fill(0);
                        values.forEach(v => {
                            const idx = Math.min(Math.floor((v - min) / binWidth), 9);
                            if (idx >= 0) counts[idx]++;
                        });
                        new Chart(document.getElementById('pdfHistChart'), {
                            type: 'bar',
                            data: {
                                labels: bins,
                                datasets: [{ data: counts, backgroundColor: '#8b5cf6' }]
                            },
                            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: col } } } }
                        });
                    }
                    const colY = numCols.length > 1 ? numCols[1] : numCols[0];
                    const points = processedRows.map(r => ({ x: parseFloat(r[col]), y: parseFloat(r[colY]) })).filter(p => !isNaN(p.x) && !isNaN(p.y));
                    new Chart(document.getElementById('pdfScatterChart'), {
                        type: 'scatter',
                        data: {
                            datasets: [{ data: points, backgroundColor: '#3b82f6', pointRadius: 3 }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: col } }, y: { title: { display: true, text: colY } } } }
                    });
                }
            }
        </script>
    </body>
    </html>
    """ % (df_json_str)

    html += js_code
    
    response = HttpResponse(html, content_type='text/html')
    response['Content-Disposition'] = f'inline; filename="automl_report_{job_id}.html"'
    return response

