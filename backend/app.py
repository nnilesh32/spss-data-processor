import os
import shutil
import tempfile
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional

from spss_parser import (
    parse_spss_file,
    extract_data_dictionary,
    get_variable_stats,
    auto_detect_multi_response_groups,
    get_multi_response_stats,
    calculate_banner_crosstab
)

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
    Uploads an SPSS .sav file, parses it, and initializes the session.
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
        
        # Auto-detect multi-response groups
        detected_groups = auto_detect_multi_response_groups(df, meta)
        
        # Initialize SESSION
        SESSION["df"] = df
        SESSION["meta"] = meta
        SESSION["dictionary"] = data_dict
        SESSION["file_path"] = temp_path
        SESSION["original_filename"] = file.filename
        SESSION["multi_response_groups"] = {g["group_id"]: g for g in detected_groups}
        
        return {
            "message": "File uploaded and parsed successfully.",
            "filename": file.filename,
            "row_count": len(df),
            "variable_count": len(meta.column_names),
            "variables": data_dict,
            "suggested_groups": detected_groups
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process SPSS file: {str(e)}")

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
        # Find variable type and format details from dictionary
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
        if checked_val.isdigit():
            checked_val = int(checked_val)
        else:
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
        # Format list to not include value_labels_dict in export
        var_dict_df = var_dict_df.drop(columns=["value_labels_dict"], errors="ignore")
        
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

# Serve frontend static files
# We will use FastAPI to serve frontend static files directly if required, 
# or they can run standard HTML in double click. Let's serve it from the root path
# to make local deployment extremely easy.
from fastapi.staticfiles import StaticFiles

# Create frontend dir if not exists
frontend_dir = "/Users/nileshjadhav/Desktop/SPSS/frontend"
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
