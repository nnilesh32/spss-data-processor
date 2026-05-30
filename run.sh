#!/bin/bash

# Exit on error
set -e

# Base directory
BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$BASE_DIR"

echo "=========================================================="
echo "      SPSS Online Data Processor Bootstrap System"
echo "=========================================================="

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed on this system."
    exit 1
fi

# Set up virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment 'venv'..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing/verifying python dependencies..."
pip install -r backend/requirements.txt

# Start FastAPI/Uvicorn server
echo ""
echo "=========================================================="
echo "  Server is starting up!"
echo "  Open your browser and navigate to: http://localhost:8080"
echo "  To stop the server, press Ctrl+C"
echo "=========================================================="
echo ""

# We run uvicorn. Note: backend/app.py is in the backend module.
# To import app from app.py inside backend, we should add backend/ to PYTHONPATH
# or use python -m uvicorn. Let's run from backend directory or set PYTHONPATH.
export PYTHONPATH="$BASE_DIR/backend:$PYTHONPATH"
exec uvicorn app:app --host 0.0.0.0 --port 8080 --reload
