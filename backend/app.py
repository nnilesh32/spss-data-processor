import os
import shutil
import tempfile
import sqlite3
import json
import uuid
from datetime import datetime
import pandas as pd
import pyreadstat
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional

# Load .env file manually on startup if it exists
app_dir = os.path.dirname(os.path.abspath(__file__)) # SPSS/backend
root_dir = os.path.dirname(app_dir) # SPSS
dotenv_path = os.path.join(root_dir, ".env")
if os.path.exists(dotenv_path):
    with open(dotenv_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip("'\"")

from spss_parser import (
    parse_spss_file,
    extract_data_dictionary,
    get_variable_stats,
    auto_detect_multi_response_groups,
    get_multi_response_stats,
    calculate_banner_crosstab
)

# Persistent storage configuration
app_dir = os.path.dirname(os.path.abspath(__file__)) # SPSS/backend
root_dir = os.path.dirname(app_dir) # SPSS
DATA_DIR = os.path.join(root_dir, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "spss_app.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Datasets table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        upload_time TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        variable_count INTEGER NOT NULL,
        file_path TEXT NOT NULL
    )
    """)
    
    # Custom groups table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS multi_response_groups (
        dataset_id TEXT,
        group_id TEXT,
        group_name TEXT NOT NULL,
        group_label TEXT NOT NULL,
        variables TEXT NOT NULL, -- JSON string list
        checked_value TEXT,
        detection_source TEXT NOT NULL,
        PRIMARY KEY (dataset_id, group_id),
        FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    )
    """)
    
    # Deleted variables presets history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS deleted_variable_presets (
        id TEXT PRIMARY KEY,
        dataset_id TEXT,
        name TEXT NOT NULL,
        variables TEXT NOT NULL, -- JSON string list of variable names
        created_at TEXT NOT NULL,
        FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    )
    """)
    
    try:
        cursor.execute("ALTER TABLE deleted_variable_presets ADD COLUMN dataset_id TEXT")
    except sqlite3.OperationalError:
        pass
    
    conn.commit()
    conn.close()

def cleanup_duplicate_datasets():
    """
    Scans the datasets table for any duplicate filenames.
    For each duplicate group, keeps only the latest one (by upload_time)
    and deletes the rest from the DB (cascade to multi_response_groups)
    and removes their .sav files from disk.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Retrieve all datasets ordered by filename, and upload_time DESC (latest first)
        cursor.execute("SELECT id, filename, upload_time, file_path FROM datasets ORDER BY filename, upload_time DESC")
        rows = cursor.fetchall()
        
        seen_filenames = set()
        to_delete = []
        
        for row in rows:
            filename = row["filename"]
            if filename in seen_filenames:
                to_delete.append((row["id"], row["file_path"]))
            else:
                seen_filenames.add(filename)
                
        if to_delete:
            print(f"Cleaning up {len(to_delete)} duplicate dataset entries from database...")
            for dataset_id, file_path in to_delete:
                # Delete from database
                cursor.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
                # Remove file from disk if it exists
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        print(f"Deleted duplicate dataset file: {file_path}")
                    except Exception as fe:
                        print(f"Error deleting file {file_path}: {fe}")
            conn.commit()
            
        conn.close()
    except Exception as e:
        print(f"Error during duplicate datasets cleanup: {e}")

# Initialize Database on Startup
init_db()
cleanup_duplicate_datasets()

app = FastAPI(title="SPSS Online Data Processor API")

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for the active dataset session
SESSION = {
    "id": None, # Active dataset database ID
    "df": None,
    "meta": None,
    "dictionary": None,
    "file_path": None,
    "original_filename": None,
    "multi_response_groups": {}  # group_id -> group_definition dict
}

class MultiResponseGroupRequest(BaseModel):
    group_name: str
    group_label: str
    variables: List[str]
    checked_value: Optional[str] = None

class CrosstabRequest(BaseModel):
    row_variables: List[str]
    column_variables: List[str]


@app.post("/api/upload")
async def upload_spss_file(file: UploadFile = File(...)):
    """
    Uploads an SPSS .sav file, parses it, persists it, and initializes the session.
    """
    if not file.filename.endswith(".sav"):
        raise HTTPException(status_code=400, detail="Only SPSS .sav files are supported.")
        
    try:
        # Save file to a temporary file
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"uploaded_{file.filename}")
        
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Parse SPSS
        df, meta = parse_spss_file(temp_path)
        
        # Extract dictionary
        data_dict = extract_data_dictionary(df, meta)
        
        # Auto-detect multi-response groups (disabled at load time to avoid slowness)
        detected_groups = []
        
        # Check if dataset with the same filename already exists
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, file_path FROM datasets WHERE filename = ?", (file.filename,))
        existing_dataset = cursor.fetchone()
        
        if existing_dataset:
            project_id = existing_dataset["id"]
            persistent_path = existing_dataset["file_path"]
            # Delete old multi-response groups for this dataset (avoid duplicate key violations)
            cursor.execute("DELETE FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        else:
            # Generate new project ID and path
            project_id = str(uuid.uuid4())
            persistent_path = os.path.join(DATA_DIR, f"{project_id}.sav")
            
        shutil.copyfile(temp_path, persistent_path)
        try:
            os.remove(temp_path)
        except Exception:
            pass
            
        upload_time = datetime.now().isoformat()
        row_count = len(df)
        var_count = len(meta.column_names)
        
        if existing_dataset:
            # Update existing project metadata in SQLite
            cursor.execute("""
            UPDATE datasets 
            SET upload_time = ?, row_count = ?, variable_count = ?
            WHERE id = ?
            """, (upload_time, row_count, var_count, project_id))
        else:
            # Save new project metadata in SQLite
            cursor.execute("""
            INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (project_id, file.filename, upload_time, row_count, var_count, persistent_path))
            
        # Save auto-detected groups in DB
        for g in detected_groups:
            cursor.execute("""
            INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                project_id,
                g["group_id"],
                g["group_name"],
                g["group_label"],
                json.dumps(g["variables"]),
                str(g["checked_value"]) if g.get("checked_value") is not None else None,
                g["detection_source"]
            ))
            
        conn.commit()
        conn.close()
        
        # Initialize SESSION
        SESSION["id"] = project_id
        SESSION["df"] = df
        SESSION["meta"] = meta
        SESSION["dictionary"] = data_dict
        SESSION["file_path"] = persistent_path
        SESSION["original_filename"] = file.filename
        SESSION["multi_response_groups"] = {g["group_id"]: g for g in detected_groups}
        
        return {
            "message": "File uploaded and parsed successfully.",
            "project_id": project_id,
            "filename": file.filename,
            "row_count": row_count,
            "variable_count": var_count,
            "variables": data_dict,
            "suggested_groups": detected_groups
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process SPSS file: {str(e)}")

@app.get("/api/projects")
def get_all_projects():
    """
    Returns a list of all previously uploaded datasets (projects).
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, filename, upload_time, row_count, variable_count FROM datasets ORDER BY upload_time DESC")
        rows = cursor.fetchall()
        conn.close()
        
        projects = []
        for row in rows:
            projects.append({
                "id": row["id"],
                "filename": row["filename"],
                "upload_time": row["upload_time"],
                "row_count": row["row_count"],
                "variable_count": row["variable_count"]
            })
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")

@app.delete("/api/project/{project_id}")
def delete_project(project_id: str):
    """
    Deletes a project/dataset by ID, removes its file from disk, and updates the database.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM datasets WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Project not found.")
            
        file_path = row["file_path"]
        
        # Enable PRAGMA foreign_keys = ON to ensure cascading delete
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("DELETE FROM datasets WHERE id = ?", (project_id,))
        conn.commit()
        conn.close()
        
        # Delete file from disk if it exists
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as fe:
                print(f"Error deleting file from disk: {fe}")
                
        # If the deleted project was the active session, reset it
        if SESSION["id"] == project_id:
            SESSION["id"] = None
            SESSION["df"] = None
            SESSION["meta"] = None
            SESSION["dictionary"] = None
            SESSION["file_path"] = None
            SESSION["original_filename"] = None
            SESSION["multi_response_groups"] = {}
            
        return {"message": "Project deleted successfully."}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")


@app.post("/api/project/load/{project_id}")
def load_project(project_id: str):
    """
    Loads a previously uploaded project/dataset by ID and populates the active session.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM datasets WHERE id = ?", (project_id,))
        project = cursor.fetchone()
        
        if not project:
            conn.close()
            raise HTTPException(status_code=404, detail="Project not found.")
            
        file_path = project["file_path"]
        if not os.path.exists(file_path):
            conn.close()
            raise HTTPException(status_code=404, detail=f"Dataset file not found on disk at: {file_path}")
            
        # Parse SPSS
        df, meta = parse_spss_file(file_path)
        data_dict = extract_data_dictionary(df, meta)
        
        # Load saved custom groups for this dataset
        cursor.execute("SELECT * FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        groups_rows = cursor.fetchall()
        conn.close()
        
        loaded_groups = {}
        for row in groups_rows:
            checked_val = row["checked_value"]
            if checked_val is not None:
                try:
                    checked_val = int(checked_val)
                except ValueError:
                    try:
                        checked_val = float(checked_val)
                    except ValueError:
                        pass
                        
            loaded_groups[row["group_id"]] = {
                "group_id": row["group_id"],
                "group_name": row["group_name"],
                "group_label": row["group_label"],
                "variables": json.loads(row["variables"]),
                "checked_value": checked_val,
                "detection_source": row["detection_source"]
            }
            
        # Populate active SESSION
        SESSION["id"] = project_id
        SESSION["df"] = df
        SESSION["meta"] = meta
        SESSION["dictionary"] = data_dict
        SESSION["file_path"] = file_path
        SESSION["original_filename"] = project["filename"]
        SESSION["multi_response_groups"] = loaded_groups
        
        return {
            "message": f"Project '{project['filename']}' loaded successfully.",
            "project_id": project_id,
            "filename": project["filename"],
            "row_count": len(df),
            "variable_count": len(meta.column_names),
            "variables": data_dict,
            "multi_response_groups": list(loaded_groups.values())
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to load project: {str(e)}")

@app.get("/api/variables")
def get_variables():
    """
    Returns the list of variables in the active dataset.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    return {
        "filename": SESSION["original_filename"],
        "row_count": len(SESSION["df"]),
        "variables": SESSION["dictionary"],
        "multi_response_groups": list(SESSION["multi_response_groups"].values())
    }

@app.get("/api/variable/{var_name}")
def get_variable_details(var_name: str):
    """
    Returns detailed metadata and frequency stats for a single variable.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    try:
        stats = get_variable_stats(SESSION["df"], SESSION["meta"], var_name)
        var_dict = next((v for v in SESSION["dictionary"] if v["variable_name"] == var_name), {})
        stats["measurement_level"] = var_dict.get("measurement_level", "unknown")
        stats["type"] = var_dict.get("type", "unknown")
        stats["format"] = var_dict.get("format", "")
        stats["value_labels"] = var_dict.get("value_labels_dict", {})
        
        return stats
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/frequencies/all")
def get_all_frequencies():
    """
    Returns detailed metadata and frequency stats for all variables and multi-response groups.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    try:
        results = []
        
        # 1. Compute multi-response groups
        for group_id, group_def in SESSION["multi_response_groups"].items():
            try:
                stats = get_multi_response_stats(
                    SESSION["df"],
                    SESSION["meta"],
                    group_def["variables"],
                    group_def["group_name"],
                    group_def["group_label"],
                    checked_value=group_def.get("checked_value")
                )
                stats["group_id"] = group_id
                stats["variables"] = group_def["variables"]
                stats["is_group"] = True
                results.append(stats)
            except Exception as e:
                print(f"Error calculating stats for group {group_id}: {e}")
        
        # 2. Compute single variables
        for var_dict in SESSION["dictionary"]:
            var_name = var_dict.get("variable_name")
            if not var_name or var_name not in SESSION["df"].columns:
                continue
            try:
                stats = get_variable_stats(SESSION["df"], SESSION["meta"], var_name)
                stats["measurement_level"] = var_dict.get("measurement_level", "unknown")
                stats["type"] = var_dict.get("type", "unknown")
                stats["format"] = var_dict.get("format", "")
                stats["value_labels"] = var_dict.get("value_labels_dict", {})
                stats["is_group"] = False
                results.append(stats)
            except Exception as e:
                print(f"Error calculating stats for variable {var_name}: {e}")
                
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/multi-response/group")
def create_multi_response_group(req: MultiResponseGroupRequest):
    """
    Creates or updates a custom multi-response variable group.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    # Validation
    for var in req.variables:
        if var not in SESSION["df"].columns:
            raise HTTPException(status_code=400, detail=f"Variable '{var}' does not exist in the dataset.")
            
    group_id = f"group_{req.group_name.strip().lower().replace(' ', '_')}"
    
    # Resolve checked value type (try int/float if possible)
    checked_val = req.checked_value
    if checked_val is not None:
        try:
            checked_val = int(checked_val)
        except ValueError:
            try:
                checked_val = float(checked_val)
            except ValueError:
                pass
                
    try:
        # Calculate stats to ensure group is valid
        stats = get_multi_response_stats(
            SESSION["df"], 
            SESSION["meta"], 
            req.variables, 
            req.group_name.upper(), 
            req.group_label,
            checked_value=checked_val
        )
        
        group_def = {
            "group_id": group_id,
            "group_name": req.group_name.upper(),
            "group_label": req.group_label,
            "variables": req.variables,
            "checked_value": checked_val,
            "detection_source": "user_defined"
        }
        
        SESSION["multi_response_groups"][group_id] = group_def
        
        # Save to database if session is persisted
        if SESSION["id"]:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                INSERT OR REPLACE INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    SESSION["id"],
                    group_id,
                    req.group_name.upper(),
                    req.group_label,
                    json.dumps(req.variables),
                    str(req.checked_value) if req.checked_value is not None else None,
                    "user_defined"
                ))
                conn.commit()
                conn.close()
            except Exception as dbe:
                print(f"Error persisting custom group: {str(dbe)}")
        
        return {
            "message": "Multi-response group created successfully.",
            "group": group_def,
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create group: {str(e)}")

@app.get("/api/multi-response/group/{group_id}")
def get_multi_response_group_details(group_id: str):
    """
    Returns frequencies and percentages for a multi-response variable group.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    group_def = SESSION["multi_response_groups"].get(group_id)
    if not group_def:
        raise HTTPException(status_code=404, detail="Multi-response group not found.")
        
    try:
        stats = get_multi_response_stats(
            SESSION["df"],
            SESSION["meta"],
            group_def["variables"],
            group_def["group_name"],
            group_def["group_label"],
            checked_value=group_def.get("checked_value")
        )
        stats["group_id"] = group_id
        stats["variables"] = group_def["variables"]
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/multi-response/group/{group_id}")
def delete_multi_response_group(group_id: str):
    """
    Deletes a multi-response group.
    """
    if group_id in SESSION["multi_response_groups"]:
        del SESSION["multi_response_groups"][group_id]
        
        # Delete from database if session is persisted
        if SESSION["id"]:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("DELETE FROM multi_response_groups WHERE dataset_id = ? AND group_id = ?", (SESSION["id"], group_id))
                conn.commit()
                conn.close()
            except Exception as dbe:
                print(f"Error deleting group from DB: {str(dbe)}")
                
        return {"message": "Group deleted successfully."}
    else:
        raise HTTPException(status_code=404, detail="Group not found.")

@app.post("/api/crosstab")
def get_crosstab_analysis(req: CrosstabRequest):
    """
    Generates contingency tables (crosstabs) for combinations of row and column variables.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    results = []
    # Filter valid column variables
    valid_col_vars = [c for c in req.column_variables if c in SESSION["df"].columns]
    if not valid_col_vars:
        return {"results": []}
        
    for row_var in req.row_variables:
        if row_var not in SESSION["df"].columns:
            continue
        try:
            ct_data = calculate_banner_crosstab(SESSION["df"], SESSION["meta"], row_var, valid_col_vars)
            results.append(ct_data)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Error calculating banner crosstab for row {row_var}: {str(e)}")
            
    return {
        "results": results
    }


@app.get("/api/dictionary/export")
def export_data_dictionary(format: str = "excel"):
    """
    Exports a detailed data dictionary to CSV or Excel.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    try:
        # Create DataFrames for dictionary
        var_dict_df = pd.DataFrame(SESSION["dictionary"])
        # Select only the standard 6 columns to exclude new SPSS specific grid columns and dict objects
        var_dict_df = var_dict_df[[
            "variable_name", 
            "variable_label", 
            "measurement_level", 
            "type", 
            "format", 
            "value_labels"
        ]]
        
        # Rename columns to be human-readable
        var_dict_df.columns = [
            "Variable Name", 
            "Variable Label", 
            "Measurement Level", 
            "Data Type", 
            "Display Format", 
            "Value Labels"
        ]
        
        # Create DataFrame for Multi-Response groups
        mr_groups_list = []
        for gid, gdef in SESSION["multi_response_groups"].items():
            mr_groups_list.append({
                "Group ID": gid,
                "Group Name": gdef["group_name"],
                "Group Label": gdef["group_label"],
                "Variables": ", ".join(gdef["variables"]),
                "Checked Value": str(gdef.get("checked_value") or "Auto-detected")
            })
        mr_df = pd.DataFrame(mr_groups_list) if mr_groups_list else pd.DataFrame(columns=[
            "Group ID", "Group Name", "Group Label", "Variables", "Checked Value"
        ])
        
        temp_dir = tempfile.gettempdir()
        
        if format.lower() == "csv":
            # CSV can only export one sheet. We'll export the primary dictionary.
            export_path = os.path.join(temp_dir, "spss_data_dictionary.csv")
            var_dict_df.to_csv(export_path, index=False)
            media_type = "text/csv"
            filename = "spss_data_dictionary.csv"
        else:
            # Excel export with sheets
            export_path = os.path.join(temp_dir, "spss_data_dictionary.xlsx")
            with pd.ExcelWriter(export_path, engine="openpyxl") as writer:
                var_dict_df.to_excel(writer, sheet_name="Data Dictionary", index=False)
                mr_df.to_excel(writer, sheet_name="Multi-Response Groups", index=False)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "spss_data_dictionary.xlsx"
            
        return FileResponse(
            path=export_path,
            filename=filename,
            media_type=media_type
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate data dictionary: {str(e)}")


@app.get("/api/data/view")
def get_data_view(page: int = 1, page_size: int = 100, filters: str = "{}"):
    """
    Returns a paginated list of cases/records from the active dataset, optionally filtered by columns.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    try:
        df = SESSION["df"]
        
        # Parse column-wise filters
        import json
        filters_dict = {}
        if filters:
            try:
                filters_dict = json.loads(filters)
            except Exception:
                pass
                
        # Apply filters in Pandas
        filtered_df = df
        for col, query in filters_dict.items():
            if col in df.columns and query:
                if isinstance(query, list):
                    # Excel checklist filtering
                    numeric_vals = []
                    string_vals = []
                    for val in query:
                        try:
                            numeric_vals.append(float(val))
                        except (ValueError, TypeError):
                            pass
                        string_vals.append(str(val))
                    
                    mask = filtered_df[col].isin(query) | \
                           filtered_df[col].isin(numeric_vals) | \
                           filtered_df[col].astype(str).isin(string_vals)
                    filtered_df = filtered_df[mask]
                else:
                    # Text contains filtering fallback
                    query_str = str(query).strip().lower()
                    filtered_df = filtered_df[filtered_df[col].astype(str).str.lower().str.contains(query_str, na=False)]
                
        total_cases = len(filtered_df)
        
        # Calculate pagination bounds
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        # Safety bounds
        if start_idx < 0:
            start_idx = 0
        if start_idx >= total_cases:
            start_idx = max(0, total_cases - page_size)
            
        df_slice = filtered_df.iloc[start_idx:end_idx].copy()
        
        # Convert row indexes to list of dicts
        raw_records = df_slice.to_dict(orient="records")
        
        # Clean values for standard JSON compatibility
        # Replace NaN / Inf / None values with empty strings in a safe Python loop
        import numpy as np
        records = []
        for row in raw_records:
            cleaned_row = {}
            for col, val in row.items():
                if val is None or pd.isna(val):
                    cleaned_row[col] = ""
                elif val == float('inf') or val == float('-inf'):
                    cleaned_row[col] = ""
                else:
                    cleaned_row[col] = val
            records.append(cleaned_row)
        columns = list(df.columns)
        
        return {
            "columns": columns,
            "data": records,
            "page": page,
            "page_size": page_size,
            "total_cases": total_cases
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to retrieve data view: {str(e)}")


@app.get("/api/data/export")
def export_data_view(value_labels: bool = False, filters: str = "{}"):
    """
    Exports the paginated/filtered data view cases to Excel format.
    If value_labels is True, maps numerical codes to their mapped labels.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    try:
        df = SESSION["df"]
        
        # Parse column-wise filters
        import json
        filters_dict = {}
        if filters:
            try:
                filters_dict = json.loads(filters)
            except Exception:
                pass
                
        # Apply filters in Pandas
        filtered_df = df.copy()
        for col, query in filters_dict.items():
            if col in df.columns and query:
                if isinstance(query, list):
                    numeric_vals = []
                    string_vals = []
                    for val in query:
                        try:
                            numeric_vals.append(float(val))
                        except (ValueError, TypeError):
                            pass
                        string_vals.append(str(val))
                    
                    mask = filtered_df[col].isin(query) | \
                           filtered_df[col].isin(numeric_vals) | \
                           filtered_df[col].astype(str).isin(string_vals)
                    filtered_df = filtered_df[mask]
                else:
                    query_str = str(query).strip().lower()
                    filtered_df = filtered_df[filtered_df[col].astype(str).str.lower().str.contains(query_str, na=False)]
        
        # Apply value labels if requested
        if value_labels:
            # Map column values using meta.value_labels if available
            value_labels_meta = getattr(SESSION["meta"], 'value_labels', {}) or {}
            variable_to_label = getattr(SESSION["meta"], 'variable_to_label', {}) or {}
            
            for col in filtered_df.columns:
                # Find labels mapping key
                label_key = variable_to_label.get(col) or col
                labels_dict = value_labels_meta.get(label_key) or value_labels_meta.get(col) or {}
                
                if labels_dict:
                    def map_val(val):
                        if val is None or pd.isna(val):
                            return val
                        # Direct lookup
                        if val in labels_dict:
                            return labels_dict[val]
                        # String/Float/Int lookup fallbacks
                        try:
                            val_int = int(val)
                            if val_int in labels_dict:
                                return labels_dict[val_int]
                        except (ValueError, TypeError):
                            pass
                        try:
                            val_str = str(val)
                            if val_str in labels_dict:
                                return labels_dict[val_str]
                        except (ValueError, TypeError):
                            pass
                        return val
                    
                    filtered_df[col] = filtered_df[col].apply(map_val)
                    
        # Replace NaN / Inf values with None for Excel output
        import numpy as np
        filtered_df = filtered_df.replace({pd.NA: None})
        filtered_df = filtered_df.replace([np.nan, np.inf, -np.inf], None)
        
        # Write to temporary file
        temp_dir = tempfile.gettempdir()
        export_path = os.path.join(temp_dir, "spss_data_export.xlsx")
        
        # Write to Excel
        filtered_df.to_excel(export_path, sheet_name="Data View", index=False)
        
        # Return file response
        filename = f"data_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return FileResponse(
            path=export_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to export data view: {str(e)}")


@app.get("/api/data/column-values")
def get_column_unique_values(column: str):
    """
    Returns a sorted list of unique values and their value labels for a specific column.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    df = SESSION["df"]
    if column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column}' not found in active dataset.")
        
    try:
        # Get unique values, dropping NaNs
        unique_vals = df[column].dropna().unique()
        
        # Sort them numerically or string-wise
        try:
            unique_vals = sorted(unique_vals)
        except Exception:
            unique_vals = sorted([str(v) for v in unique_vals])
            
        # Get value labels mapping
        value_labels = getattr(SESSION["meta"], 'value_labels', {}) or {}
        variable_to_label = getattr(SESSION["meta"], 'variable_to_label', {}) or {}
        val_labels_dict = value_labels.get(variable_to_label.get(column) or column) or value_labels.get(column) or {}
        
        result = []
        for val in unique_vals:
            # Check for mapping match
            label = val_labels_dict.get(val) or val_labels_dict.get(str(val)) or val_labels_dict.get(int(val) if isinstance(val, (int, float)) and val.is_integer() else val) or ""
            
            # Formatting floats to ints to avoid .0 representation
            val_safe = int(val) if isinstance(val, (int, float)) and val.is_integer() else val
            
            result.append({
                "value": val_safe,
                "label": str(label) if label else str(val_safe)
            })
            
        return {
            "column": column,
            "values": result
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to retrieve unique column values: {str(e)}")


class RenameVariableRequest(BaseModel):
    mode: str  # "single", "bulk_names", "bulk_labels"
    variable: str | None = None
    new_name: str | None = None
    new_label: str | None = None
    renames: dict[str, str] | None = None
    labels: dict[str, str] | None = None

@app.post("/api/variables/rename")
def rename_variables(req: RenameVariableRequest):
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    df = SESSION["df"]
    meta = SESSION["meta"]
    project_id = SESSION["id"]
    file_path = SESSION["file_path"]
    
    import re
    import shutil
    
    def is_valid_variable_name(name: str) -> bool:
        return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", name)) and len(name) <= 64

    variable_rename_map = {}
    label_rename_map = {}
    
    if req.mode == "single":
        if not req.variable or not req.new_name:
            raise HTTPException(status_code=400, detail="Variable and new_name are required for mode 'single'")
        if req.variable not in df.columns:
            raise HTTPException(status_code=400, detail=f"Variable '{req.variable}' not found in dataset.")
        if not is_valid_variable_name(req.new_name):
            raise HTTPException(status_code=400, detail=f"Invalid variable name '{req.new_name}'. Must start with a letter and contain only alphanumeric characters and underscores.")
        if req.new_name != req.variable and req.new_name in df.columns:
            raise HTTPException(status_code=400, detail=f"Variable name '{req.new_name}' already exists in dataset.")
            
        variable_rename_map[req.variable] = req.new_name
        if req.new_label is not None:
            label_rename_map[req.new_name] = req.new_label
            
    elif req.mode == "bulk_names":
        if not req.renames:
            raise HTTPException(status_code=400, detail="Renames map is required for mode 'bulk_names'")
        
        for old, new in req.renames.items():
            if old not in df.columns:
                raise HTTPException(status_code=400, detail=f"Variable '{old}' not found in dataset.")
            if not is_valid_variable_name(new):
                raise HTTPException(status_code=400, detail=f"Invalid variable name '{new}'. Must start with a letter and contain only alphanumeric characters and underscores.")
            
            non_renamed_cols = [c for c in df.columns if c not in req.renames]
            if new in non_renamed_cols:
                raise HTTPException(status_code=400, detail=f"Target variable name '{new}' already exists in dataset.")
                
            variable_rename_map[old] = new
            
        new_names_list = list(req.renames.values())
        if len(new_names_list) != len(set(new_names_list)):
            raise HTTPException(status_code=400, detail="Duplicate target names found in bulk rename payload.")
            
    elif req.mode == "bulk_labels":
        if not req.labels:
            raise HTTPException(status_code=400, detail="Labels map is required for mode 'bulk_labels'")
        for var, label in req.labels.items():
            if var not in df.columns:
                raise HTTPException(status_code=400, detail=f"Variable '{var}' not found in dataset.")
            label_rename_map[var] = label
            
    else:
        raise HTTPException(status_code=400, detail="Invalid mode. Must be 'single', 'bulk_names', or 'bulk_labels'.")
        
    if not variable_rename_map and not label_rename_map:
        return {
            "message": "No changes requested.",
            "dictionary": SESSION["dictionary"]
        }
        
    backup_path = file_path + ".bak"
    shutil.copyfile(file_path, backup_path)
    
    try:
        if variable_rename_map:
            new_df = df.rename(columns=variable_rename_map)
        else:
            new_df = df.copy()
            
        remaining_cols = list(new_df.columns)
        
        col_labels_map = dict(zip(meta.column_names, meta.column_labels))
        
        def remap_dict_keys(d, mapping):
            new_d = {}
            if d:
                for k, v in d.items():
                    if k in mapping:
                        new_d[mapping[k]] = v
                    else:
                        new_d[k] = v
            return new_d
            
        updated_labels_map = {}
        for col in df.columns:
            current_label = col_labels_map.get(col, "")
            current_name = col
            if col in variable_rename_map:
                current_name = variable_rename_map[col]
            if current_name in label_rename_map:
                current_label = label_rename_map[current_name]
            updated_labels_map[current_name] = current_label
            
        new_column_labels = [updated_labels_map[col] for col in remaining_cols]
        
        new_variable_value_labels = remap_dict_keys(getattr(meta, "variable_value_labels", {}), variable_rename_map)
        new_missing_ranges = remap_dict_keys(getattr(meta, "missing_ranges", {}), variable_rename_map)
        new_formats = remap_dict_keys(getattr(meta, "original_variable_types", {}), variable_rename_map)
        new_measure = remap_dict_keys(getattr(meta, "variable_measure", {}), variable_rename_map)
        new_display_width = remap_dict_keys(getattr(meta, "variable_display_width", {}), variable_rename_map)
        
        pyreadstat.write_sav(
            new_df,
            file_path,
            column_labels=new_column_labels,
            variable_value_labels=new_variable_value_labels,
            missing_ranges=new_missing_ranges,
            variable_format=new_formats,
            variable_measure=new_measure,
            variable_display_width=new_display_width
        )
        
        reloaded_df, reloaded_meta = parse_spss_file(file_path)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if variable_rename_map:
            cursor.execute("SELECT group_id, variables FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
            groups = cursor.fetchall()
            for g in groups:
                g_id = g["group_id"]
                g_vars = json.loads(g["variables"])
                has_updates = False
                updated_vars = []
                for v in g_vars:
                    if v in variable_rename_map:
                        updated_vars.append(variable_rename_map[v])
                        has_updates = True
                    else:
                        updated_vars.append(v)
                if has_updates:
                    cursor.execute("UPDATE multi_response_groups SET variables = ? WHERE dataset_id = ? AND group_id = ?", (json.dumps(updated_vars), project_id, g_id))
                    if g_id in SESSION["multi_response_groups"]:
                        SESSION["multi_response_groups"][g_id]["variables"] = updated_vars
                        
        conn.commit()
        conn.close()
        
        if os.path.exists(backup_path):
            os.remove(backup_path)
            
        SESSION["df"] = reloaded_df
        SESSION["meta"] = reloaded_meta
        SESSION["dictionary"] = extract_data_dictionary(reloaded_df, reloaded_meta)
        
        return {
            "message": "Variables renamed successfully.",
            "mode": req.mode,
            "dictionary": SESSION["dictionary"]
        }
        
    except Exception as e:
        if os.path.exists(backup_path):
            try:
                shutil.copyfile(backup_path, file_path)
                os.remove(backup_path)
            except Exception as restore_err:
                print(f"Error restoring backup: {restore_err}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to rename variables: {str(e)}")


class ExecuteSyntaxRequest(BaseModel):
    syntax: str

@app.post("/api/variables/execute-syntax")
def execute_syntax(req: ExecuteSyntaxRequest):
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    df = SESSION["df"]
    meta = SESSION["meta"]
    project_id = SESSION["id"]
    file_path = SESSION["file_path"]
    
    import shutil
    from spss_syntax_parser import split_spss_syntax, execute_spss_statement
    
    backup_path = file_path + ".bak"
    shutil.copyfile(file_path, backup_path)
    
    try:
        statements = split_spss_syntax(req.syntax)
        
        # In-memory working copies
        working_df = df.copy()
        
        variable_rename_map = {}
        label_rename_map = {}
        value_labels_map = {}
        missing_ranges_map = {}
        logs = []
        
        for stmt in statements:
            working_df, meta = execute_spss_statement(
                stmt, 
                working_df, 
                meta, 
                variable_rename_map, 
                label_rename_map, 
                value_labels_map, 
                missing_ranges_map, 
                logs
            )
            
        remaining_cols = list(working_df.columns)
        
        # Rebuild metadata structures
        col_labels_map = dict(zip(meta.column_names, meta.column_labels))
        reverse_rename = {v: k for k, v in variable_rename_map.items()}
        
        new_column_labels = []
        for col in remaining_cols:
            orig_col = reverse_rename.get(col, col)
            label = label_rename_map.get(col, col_labels_map.get(orig_col, ""))
            new_column_labels.append(label)
            
        new_variable_value_labels = {}
        for old_col, labels in getattr(meta, "variable_value_labels", {}).items():
            new_col = variable_rename_map.get(old_col, old_col)
            if new_col in remaining_cols:
                new_variable_value_labels[new_col] = labels
        for col, labels in value_labels_map.items():
            if col in remaining_cols:
                new_variable_value_labels[col] = labels
                
        new_missing_ranges = {}
        for old_col, val in getattr(meta, "missing_ranges", {}).items():
            new_col = variable_rename_map.get(old_col, old_col)
            if new_col in remaining_cols:
                new_missing_ranges[new_col] = val
        for col, val in missing_ranges_map.items():
            if col in remaining_cols:
                new_missing_ranges[col] = val
                
        new_formats = {}
        for old_col, val in getattr(meta, "original_variable_types", {}).items():
            new_col = variable_rename_map.get(old_col, old_col)
            if new_col in remaining_cols:
                new_formats[new_col] = val
                
        new_measure = {}
        for old_col, val in getattr(meta, "variable_measure", {}).items():
            new_col = variable_rename_map.get(old_col, old_col)
            if new_col in remaining_cols:
                new_measure[new_col] = val
                
        new_display_width = {}
        for old_col, val in getattr(meta, "variable_display_width", {}).items():
            new_col = variable_rename_map.get(old_col, old_col)
            if new_col in remaining_cols:
                new_display_width[new_col] = val
                
        pyreadstat.write_sav(
            working_df,
            file_path,
            column_labels=new_column_labels,
            variable_value_labels=new_variable_value_labels,
            missing_ranges=new_missing_ranges,
            variable_format=new_formats,
            variable_measure=new_measure,
            variable_display_width=new_display_width
        )
        
        reloaded_df, reloaded_meta = parse_spss_file(file_path)
        
        # Apply database updates for deleted or renamed columns in MR groups
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Cascade variable deletions / renames in groups
        cursor.execute("SELECT group_id, variables FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        groups = cursor.fetchall()
        for g in groups:
            g_id = g["group_id"]
            g_vars = json.loads(g["variables"])
            updated_vars = []
            has_updates = False
            for v in g_vars:
                # If deleted
                if v not in remaining_cols and variable_rename_map.get(v) not in remaining_cols:
                    has_updates = True
                    continue
                # If renamed
                elif v in variable_rename_map:
                    updated_vars.append(variable_rename_map[v])
                    has_updates = True
                else:
                    updated_vars.append(v)
            
            if has_updates:
                if len(updated_vars) < 2:
                    # delete group entirely if fewer than 2 variables remain
                    cursor.execute("DELETE FROM multi_response_groups WHERE dataset_id = ? AND group_id = ?", (project_id, g_id))
                    if g_id in SESSION["multi_response_groups"]:
                        del SESSION["multi_response_groups"][g_id]
                else:
                    cursor.execute("UPDATE multi_response_groups SET variables = ? WHERE dataset_id = ? AND group_id = ?", (json.dumps(updated_vars), project_id, g_id))
                    if g_id in SESSION["multi_response_groups"]:
                        SESSION["multi_response_groups"][g_id]["variables"] = updated_vars
                        
        conn.commit()
        conn.close()
        
        if os.path.exists(backup_path):
            os.remove(backup_path)
            
        SESSION["df"] = reloaded_df
        SESSION["meta"] = reloaded_meta
        SESSION["dictionary"] = extract_data_dictionary(reloaded_df, reloaded_meta)
        
        # Update variable count in datasets table
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE datasets SET variable_count = ? WHERE id = ?", (len(reloaded_df.columns), project_id))
        conn.commit()
        conn.close()
        
        return {
            "message": "Syntax executed successfully.",
            "logs": logs,
            "dictionary": SESSION["dictionary"]
        }
        
    except Exception as e:
        if os.path.exists(backup_path):
            try:
                shutil.copyfile(backup_path, file_path)
                os.remove(backup_path)
            except Exception as restore_err:
                print(f"Error restoring backup: {restore_err}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to execute syntax: {str(e)}")


class DeleteVariablesRequest(BaseModel):
    variables: list[str]
    preset_name: str | None = None

@app.get("/api/variables/deletion-presets")
def get_deletion_presets():
    if SESSION["id"] is None:
        return []
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM deleted_variable_presets WHERE dataset_id = ? ORDER BY created_at DESC", (SESSION["id"],))
        rows = cursor.fetchall()
        conn.close()
        
        presets = []
        for row in rows:
            presets.append({
                "id": row["id"],
                "name": row["name"],
                "variables": json.loads(row["variables"]),
                "created_at": row["created_at"]
            })
        return presets
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch presets: {str(e)}")

@app.post("/api/variables/delete")
def delete_variables(req: DeleteVariablesRequest):
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No active dataset. Please upload a file first.")
        
    df = SESSION["df"]
    meta = SESSION["meta"]
    project_id = SESSION["id"]
    file_path = SESSION["file_path"]
    
    # Validation
    invalid_vars = [v for v in req.variables if v not in df.columns]
    if invalid_vars:
        raise HTTPException(status_code=400, detail=f"Variables not found in dataset: {', '.join(invalid_vars)}")
        
    if len(req.variables) >= len(df.columns):
        raise HTTPException(status_code=400, detail="Cannot delete all variables from the dataset.")
        
    import shutil
    import uuid
    from datetime import datetime
    
    # Create file backup
    backup_path = file_path + ".bak"
    shutil.copyfile(file_path, backup_path)
    
    try:
        # Drop columns from df
        new_df = df.drop(columns=req.variables)
        remaining_cols = list(new_df.columns)
        
        # Filter metadata
        # Map from col name to label
        col_labels_map = dict(zip(meta.column_names, meta.column_labels))
        new_column_labels = [col_labels_map[col] for col in remaining_cols]
        
        # Filter value labels
        new_variable_value_labels = {}
        if getattr(meta, "variable_value_labels", None):
            for col, labels in meta.variable_value_labels.items():
                if col in remaining_cols:
                    new_variable_value_labels[col] = labels
                    
        # Filter missing ranges
        new_missing_ranges = {}
        if getattr(meta, "missing_ranges", None):
            for col, val in meta.missing_ranges.items():
                if col in remaining_cols:
                    new_missing_ranges[col] = val
                    
        # Filter formats
        new_formats = {}
        if getattr(meta, "original_variable_types", None):
            for col, val in meta.original_variable_types.items():
                if col in remaining_cols:
                    new_formats[col] = val
                    
        # Filter measure
        new_measure = {}
        if getattr(meta, "variable_measure", None):
            for col, val in meta.variable_measure.items():
                if col in remaining_cols:
                    new_measure[col] = val
                    
        # Filter display width
        new_display_width = {}
        if getattr(meta, "variable_display_width", None):
            for col, val in meta.variable_display_width.items():
                if col in remaining_cols:
                    new_display_width[col] = val
                    
        # Write back to disk
        pyreadstat.write_sav(
            new_df,
            file_path,
            column_labels=new_column_labels,
            variable_value_labels=new_variable_value_labels,
            missing_ranges=new_missing_ranges,
            variable_format=new_formats,
            variable_measure=new_measure,
            variable_display_width=new_display_width
        )
        
        # Parse again to reload the session meta perfectly
        reloaded_df, reloaded_meta = parse_spss_file(file_path)
        
        # Remove deleted variables from custom multi-response groups
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Update custom groups in database
        cursor.execute("SELECT group_id, variables FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        groups = cursor.fetchall()
        for g in groups:
            g_id = g["group_id"]
            g_vars = json.loads(g["variables"])
            updated_vars = [v for v in g_vars if v not in req.variables]
            if not updated_vars:
                cursor.execute("DELETE FROM multi_response_groups WHERE dataset_id = ? AND group_id = ?", (project_id, g_id))
                if g_id in SESSION["multi_response_groups"]:
                    del SESSION["multi_response_groups"][g_id]
            else:
                cursor.execute("UPDATE multi_response_groups SET variables = ? WHERE dataset_id = ? AND group_id = ?", (json.dumps(updated_vars), project_id, g_id))
                if g_id in SESSION["multi_response_groups"]:
                    SESSION["multi_response_groups"][g_id]["variables"] = updated_vars
                    
        # Update dataset properties in DB
        cursor.execute("UPDATE datasets SET variable_count = ? WHERE id = ?", (len(remaining_cols), project_id))
        
        # Save deletion history preset
        preset_id = str(uuid.uuid4())
        p_name = req.preset_name.strip() if req.preset_name else f"Deleted on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        cursor.execute(
            "INSERT INTO deleted_variable_presets (id, dataset_id, name, variables, created_at) VALUES (?, ?, ?, ?, ?)",
            (preset_id, project_id, p_name, json.dumps(req.variables), datetime.now().isoformat())
        )
        
        conn.commit()
        conn.close()
        
        # Remove backup file on success
        if os.path.exists(backup_path):
            os.remove(backup_path)
            
        # Reload session data
        SESSION["df"] = reloaded_df
        SESSION["meta"] = reloaded_meta
        SESSION["dictionary"] = extract_data_dictionary(reloaded_df, reloaded_meta)
        
        return {
            "message": "Variables deleted successfully.",
            "deleted_count": len(req.variables),
            "remaining_count": len(remaining_cols),
            "dictionary": SESSION["dictionary"]
        }
        
    except Exception as e:
        # Restore backup if failure occurs
        if os.path.exists(backup_path):
            try:
                shutil.copyfile(backup_path, file_path)
                os.remove(backup_path)
            except Exception as restore_err:
                print(f"Error restoring backup: {restore_err}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to delete variables: {str(e)}")


@app.get("/api/data/download-sav")
def download_sav_file():
    """
    Downloads the currently active SPSS .sav file.
    """
    if SESSION["file_path"] is None or not os.path.exists(SESSION["file_path"]):
        raise HTTPException(status_code=400, detail="No active dataset or file not found.")
        
    filename = SESSION["original_filename"] or "dataset.sav"
    if not filename.endswith(".sav"):
        filename += ".sav"
        
    return FileResponse(
        path=SESSION["file_path"],
        filename=filename,
        media_type="application/x-spss-sav"
    )


# Serve frontend static files
# We will use FastAPI to serve frontend static files directly if required, 
# or they can run standard HTML in double click. Let's serve it from the root path
# to make local deployment extremely easy.
from fastapi.staticfiles import StaticFiles

# Create frontend dir if not exists relative to this file
backend_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.join(os.path.dirname(backend_dir), "frontend")
os.makedirs(frontend_dir, exist_ok=True)

# Serve static files at root
@app.get("/")
def read_root():
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "SPSS Data Processor Backend is running. Frontend files are missing."}

# Mount other static files
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")
