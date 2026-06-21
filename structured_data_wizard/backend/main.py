import os
import uuid
import json
import asyncio
import threading
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
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

app = FastAPI(title="Intelligence Creation - Structured Data Backend")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores
datasets_db: Dict[str, pd.DataFrame] = {}
training_jobs: Dict[str, Dict[str, Any]] = {}
drafts_db: Dict[str, Any] = {}

class DatasetFetchRequest(BaseModel):
    dataset_name: str
    required_features: str
    target_column: str
    jumlah_data: int = 2000
    problem_type: Optional[str] = "classification"

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

@app.post("/api/dataset/fetch")
async def api_dataset_fetch(request: DatasetFetchRequest):
    try:
        # Generate synthetic data simulating internal database
        df = generate_synthetic_dataset(
            name=request.dataset_name,
            features_str=request.required_features,
            target=request.target_column,
            count=request.jumlah_data,
            problem_type=request.problem_type
        )
        
        # Save to memory database
        dataset_id = str(uuid.uuid4())
        datasets_db[dataset_id] = df
        
        preview = get_preview_data(df)
        return {
            "dataset_id": dataset_id,
            **preview
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dataset/upload")
async def api_dataset_upload(
    file: UploadFile = File(...),
    dataset_name: str = Form("Uploaded CSV"),
    required_features: str = Form(""),
    target_column: str = Form(""),
    jumlah_data: int = Form(2000),
    problem_type: str = Form("classification")
):
    try:
        # Read uploaded CSV
        contents = await file.read()
        import io
        df = pd.read_csv(io.BytesIO(contents))
        
        # Save to memory database
        dataset_id = str(uuid.uuid4())
        datasets_db[dataset_id] = df
        
        preview = get_preview_data(df)
        return {
            "dataset_id": dataset_id,
            **preview
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────
# /api/process — Apply preprocessing to existing dataset and return processed rows
# ─────────────────────────────────────────────
class ProcessRequest(BaseModel):
    dataset_id: str
    missing_values: str = "Drop blank rows"
    duplicate_strategy: str = "Drop Duplicates"
    categorical_encoding: bool = True
    apply_standardization: bool = True

@app.post("/api/process")
async def api_process(req: ProcessRequest):
    if req.dataset_id not in datasets_db:
        raise HTTPException(status_code=404, detail="Dataset not found. Please load a dataset first.")
    
    try:
        df = datasets_db[req.dataset_id].copy()
        
        # 1. Handle Duplicates
        if req.duplicate_strategy == "Drop Duplicates":
            df = df.drop_duplicates()
        
        # 2. Handle Missing Values
        for col in df.columns:
            if df[col].isnull().any():
                if req.missing_values == "Drop blank rows":
                    df = df.dropna(subset=[col])
                elif req.missing_values == "Fill with mean":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].mean())
                    else:
                        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
                elif req.missing_values == "Fill with median":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].median())
                    else:
                        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
                elif req.missing_values == "Fill with mode":
                    df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Missing")
        
        # 3. Categorical Encoding
        if req.categorical_encoding:
            for col in df.columns:
                if not pd.api.types.is_numeric_dtype(df[col]):
                    le = LabelEncoder()
                    df[col] = le.fit_transform(df[col].astype(str))
        
        # 4. Standardization (only numeric cols)
        if req.apply_standardization:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if numeric_cols:
                scaler = StandardScaler()
                df[numeric_cols] = scaler.fit_transform(df[numeric_cols])
                df[numeric_cols] = df[numeric_cols].round(4)
        
        # Build stats
        stats = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "numeric_columns": df.select_dtypes(include=[np.number]).columns.tolist(),
        }
        
        # Store processed dataset back (update)
        datasets_db[req.dataset_id + "_processed"] = df
        
        # Serialize rows (NaN safe)
        df_clean = df.copy().fillna(0)
        processed_rows = df_clean.to_dict(orient="records")
        
        return {
            "processed_rows": processed_rows,
            "columns": list(df.columns),
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Async Training Job Runner
def run_training_pipeline(job_id: str, config: Dict[str, Any]):
    try:
        training_jobs[job_id]["status"] = "running"
        training_jobs[job_id]["progress"] = 10
        
        dataset_id = config.get("dataset_id")
        if not dataset_id or dataset_id not in datasets_db:
            # Fallback: if dataset_id not found, generate it on the fly
            problem_type = config.get("problem_type", "classification")
            df = generate_synthetic_dataset(
                name=config.get("system_name", "Demo System"),
                features_str=config.get("required_features", "Height,Weight"),
                target=config.get("target_column", "Gender"),
                count=int(config.get("jumlah_data", 2000)),
                problem_type=problem_type
            )
            dataset_id = str(uuid.uuid4())
            datasets_db[dataset_id] = df
        else:
            df = datasets_db[dataset_id].copy()
            
        training_jobs[job_id]["progress"] = 25
        
        # Retrieve target column
        target_column = config.get("target_column", "")
        problem_type = config.get("problem_type", "classification")
        
        # If clustering, target_column is not strictly target
        # Preprocessing Config
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
                    
        training_jobs[job_id]["progress"] = 40
        
        # 3. Handle Categorical Encoding
        label_encoders = {}
        target_encoder = None
        
        # We need to process columns before splitting
        features_cols = [c for c in df.columns if c != target_column]
        
        # Encode Target Column if Classification and categorical
        y = None
        if problem_type != "clustering" and target_column in df.columns:
            if problem_type == "classification" and not pd.api.types.is_numeric_dtype(df[target_column]):
                target_encoder = LabelEncoder()
                df[target_column] = target_encoder.fit_transform(df[target_column].astype(str))
            y = df[target_column].values
            
        # Encode features
        for col in features_cols:
            if not pd.api.types.is_numeric_dtype(df[col]):
                if categorical_encoding:
                    le = LabelEncoder()
                    df[col] = le.fit_transform(df[col].astype(str))
                    label_encoders[col] = le
                else:
                    # Drop categorical features if encoding is off, or fill/convert to hash code
                    df[col] = df[col].astype("category").cat.codes
                    
        training_jobs[job_id]["progress"] = 60
        
        # Extract features
        X = df[features_cols].values
        
        # 4. Standardize Features
        scaler = None
        if standardize and len(features_cols) > 0:
            scaler = StandardScaler()
            X = scaler.fit_transform(X)
            
        training_jobs[job_id]["progress"] = 75
        
        # Model Selection & Parameters
        model_config = config.get("model_config", {})
        algo = model_config.get("algorithm", "Logistic Regression")
        params = model_config.get("parameters", {})
        
        # Convert numeric params
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
        
        # Define model based on Algorithm and Problem Type
        model = None
        
        if problem_type == "clustering":
            n_clusters = int(cleaned_params.get("n_clusters", 3))
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
            model.fit(X)
            
            # Evaluate Clustering
            labels = model.labels_
            if len(np.unique(labels)) > 1:
                sil_score = float(silhouette_score(X, labels, sample_size=min(1000, len(X))))
            else:
                sil_score = 0.0
                
            # Dummy feature importances
            feat_importances = [{"feature": f, "importance": float(1.0 / len(features_cols))} for f in features_cols]
            
            # Dummy confusion matrix for clustering
            cm = [[0, 0], [0, 0]]
            
            results = {
                "accuracy": round(sil_score * 100, 2), # Show silhouette score in accuracy slot
                "precision": round(sil_score, 2),
                "recall": round(sil_score, 2),
                "f1": round(sil_score, 2),
                "confusion_matrix": cm,
                "feature_importances": feat_importances
            }
        else:
            # Classification or Regression split
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            
            if problem_type == "classification":
                if algo == "Logistic Regression":
                    C = float(cleaned_params.get("C", 1.0))
                    max_iter = int(cleaned_params.get("max_iter", 100))
                    penalty = cleaned_params.get("penalty", "l2")
                    solver = cleaned_params.get("solver", "lbfgs")
                    
                    # saga is required for elasticnet, saga/liblinear for l1
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
                
                # Fit Classification
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                
                acc = accuracy_score(y_test, y_pred)
                
                # Compute precision, recall, f1
                is_binary = len(np.unique(y_train)) <= 2
                avg_type = "binary" if is_binary else "macro"
                
                prec = precision_score(y_test, y_pred, average=avg_type, zero_division=0)
                rec = recall_score(y_test, y_pred, average=avg_type, zero_division=0)
                f1 = f1_score(y_test, y_pred, average=avg_type, zero_division=0)
                
                # Confusion matrix
                raw_cm = confusion_matrix(y_test, y_pred)
                # Ensure 2x2 shape for standard output UI
                if raw_cm.shape == (2, 2):
                    cm = raw_cm.tolist()
                else:
                    # Pad or trim matrix to 2x2 representation or raw list
                    cm = raw_cm.tolist()
                    
                # Feature Importances
                importances = []
                if hasattr(model, "feature_importances_"):
                    importances = model.feature_importances_
                elif hasattr(model, "coef_"):
                    importances = np.abs(model.coef_[0])
                else:
                    importances = [1.0 / len(features_cols)] * len(features_cols)
                
                # Normalize importances
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
                    # Fallback to Ridge Regression for Logistic Regression algorithm card in Regression mode
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
                
                # Fit Regression
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                
                r2 = r2_score(y_test, y_pred)
                mse = mean_squared_error(y_test, y_pred)
                
                # Map R2 score to accuracy card
                results = {
                    "accuracy": round(max(0, r2) * 100, 2),
                    "precision": round(float(mse), 3), # put MSE in precision
                    "recall": 0,
                    "f1": 0,
                    "confusion_matrix": [[0, 0], [0, 0]],
                    "feature_importances": []
                }
                
                # Feature Importances for Regression
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

        training_jobs[job_id]["progress"] = 90
        
        # Save Trained Model Artifact
        model_dir = "models"
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, f"{job_id}.pkl")
        
        # Package model with preprocess info
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
            
        # Complete Job
        training_jobs[job_id]["status"] = "complete"
        training_jobs[job_id]["progress"] = 100
        training_jobs[job_id]["result"] = results
        training_jobs[job_id]["model_path"] = model_path
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        training_jobs[job_id]["status"] = "error"
        training_jobs[job_id]["error_message"] = str(e)

@app.post("/api/train")
async def api_train(config: Dict[str, Any], background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    training_jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "result": None,
        "error_message": None
    }
    
    # Run async training in background task
    background_tasks.add_task(run_training_pipeline, job_id, config)
    
    return {"job_id": job_id}

@app.get("/api/train/status/{job_id}")
async def api_train_status(job_id: str):
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = training_jobs[job_id]
    return {
        "status": job["status"],
        "progress": job["progress"],
        "error_message": job.get("error_message")
    }

@app.get("/api/train/result/{job_id}")
async def api_train_result(job_id: str):
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = training_jobs[job_id]
    if job["status"] != "complete":
        raise HTTPException(status_code=400, detail="Job is not completed yet")
    return job["result"]

@app.get("/api/model/download/{job_id}")
@app.get("/api/train/download/{job_id}")
async def api_model_download(job_id: str):
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = training_jobs[job_id]
    if job["status"] != "complete" or not job.get("model_path"):
        raise HTTPException(status_code=400, detail="Model is not trained or available")
    
    # Return file response
    return FileResponse(
        path=job["model_path"],
        filename=f"trained_model_{job_id}.pkl",
        media_type="application/octet-stream"
    )

@app.post("/api/draft/save")
async def api_draft_save(draft: Dict[str, Any]):
    submission_id = draft.get("submission_id", "default_draft")
    drafts_db[submission_id] = draft
    
    # Save to disk as well
    drafts_dir = "drafts"
    os.makedirs(drafts_dir, exist_ok=True)
    with open(os.path.join(drafts_dir, f"{submission_id}.json"), "w") as f:
        json.dump(draft, f, indent=2)
        
    return {"status": "success", "message": f"Draft saved for submission {submission_id}"}

@app.get("/api/draft/load/{submission_id}")
async def api_draft_load(submission_id: str):
    # Try database first
    if submission_id in drafts_db:
        return drafts_db[submission_id]
        
    # Try disk
    draft_file = os.path.join("drafts", f"{submission_id}.json")
    if os.path.exists(draft_file):
        try:
            with open(draft_file, "r") as f:
                draft = json.load(f)
                drafts_db[submission_id] = draft
                return draft
        except:
            pass
            
    raise HTTPException(status_code=404, detail="Draft not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8002, reload=True)
