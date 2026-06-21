import os
import uuid
import json
import threading
from django.http import JsonResponse, FileResponse, Http404
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
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, r2_score, mean_squared_error, silhouette_score
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

# File based job status reader/writer helpers
def read_job(job_id: str) -> dict:
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return {}

def write_job(job_id: str, data: dict):
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

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
            
        job["progress"] = 25
        write_job(job_id, job)
        
        target_column = config.get("target_column", "")
        problem_type = config.get("problem_type", "classification")
        
        prep_config = config.get("preprocessing_config", {})
        missing_strategy = prep_config.get("missing_values", "Drop blank rows")
        dup_strategy = prep_config.get("duplicate_strategy", "Drop Duplicates")
        categorical_encoding = prep_config.get("categorical_encoding", True)
        standardize = prep_config.get("standardization", True)
        
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
        
        model_config = config.get("model_config", {})
        algo = model_config.get("algorithm", "Logistic Regression")
        params = model_config.get("parameters", {})
        
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
        
        if problem_type == "clustering":
            n_clusters = int(cleaned_params.get("n_clusters", 3))
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
            model.fit(X)
            
            labels = model.labels_
            if len(np.unique(labels)) > 1:
                sil_score = float(silhouette_score(X, labels, sample_size=min(1000, len(X))))
            else:
                sil_score = 0.0
                
            feat_importances = [{"feature": f, "importance": float(1.0 / len(features_cols))} for f in features_cols]
            
            results = {
                "accuracy": round(sil_score * 100, 2),
                "precision": round(sil_score, 2),
                "recall": round(sil_score, 2),
                "f1": round(sil_score, 2),
                "confusion_matrix": [[0, 0], [0, 0]],
                "feature_importances": feat_importances
            }
        else:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            
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
                
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                
                acc = accuracy_score(y_test, y_pred)
                is_binary = len(np.unique(y_train)) <= 2
                avg_type = "binary" if is_binary else "macro"
                
                prec = precision_score(y_test, y_pred, average=avg_type, zero_division=0)
                rec = recall_score(y_test, y_pred, average=avg_type, zero_division=0)
                f1 = f1_score(y_test, y_pred, average=avg_type, zero_division=0)
                
                raw_cm = confusion_matrix(y_test, y_pred)
                cm = raw_cm.tolist() if raw_cm.shape == (2, 2) else raw_cm.tolist()
                
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
                
                results = {
                    "accuracy": round(acc * 100, 2),
                    "precision": round(float(prec), 3),
                    "recall": round(float(rec), 3),
                    "f1": round(float(f1), 3),
                    "confusion_matrix": cm,
                    "feature_importances": feat_importances
                }
                
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
                
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                
                r2 = r2_score(y_test, y_pred)
                mse = mean_squared_error(y_test, y_pred)
                
                results = {
                    "accuracy": round(max(0, r2) * 100, 2),
                    "precision": round(float(mse), 3),
                    "recall": 0,
                    "f1": 0,
                    "confusion_matrix": [[0, 0], [0, 0]],
                    "feature_importances": []
                }
                
                importances = []
                if hasattr(model, "feature_importances_"):
                    importances = model.feature_importances_
                elif hasattr(model, "coef_"):
                    importances = np.abs(model.coef_)
                
                if len(importances) > 0:
                    if np.sum(importances) > 0:
                        importances = importances / np.sum(importances)
                    feat_importances = [{"feature": f, "importance": round(float(imp), 4)} for f, imp in zip(features_cols, importances)]
                    feat_importances = sorted(feat_importances, key=lambda x: x["importance"], reverse=True)
                    results["feature_importances"] = feat_importances

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
        
        job = {
            "status": "pending",
            "progress": 0,
            "result": None,
            "error_message": None
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
