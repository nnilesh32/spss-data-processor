# SPSS Online Data Processor

A premium, modern online SPSS `.sav` data processing application built using FastAPI (Python) and Vanilla HTML/CSS/JS.

## Features
- **SPSS Parsing**: Loads `.sav` datasets using `pyreadstat` and generates variables list.
- **Frequency Analysis**: Computes frequency tables and renders interactive Chart.js visualizations.
- **Banner Cross-Tabulation**: Consolidated side-by-side banners for multiple column variables.
- **Significance Testing**: Proportions Z-testing with automatic letter markers.
- **CSV Data Dictionary & Table Exports**: Export data dictionary and crosstab banner tables directly to CSV.
- **Multi-Response Variables Builder**: Groups dichotomous checklists.

---

## Local Development

### 1. Requirements
Ensure you have Python 3.10+ installed.

### 2. Bootstrapping
Run the startup script in the workspace folder to set up virtual environments, install packages, and boot the server:
```bash
./run.sh
```
Go to `http://localhost:8080` in your web browser.

---

## Pushing to GitHub

1. Create a new repository on your GitHub account (e.g., named `spss-data-processor`). Do **not** initialize it with a README, `.gitignore`, or license.
2. In your terminal, run the following commands to link this local directory to your GitHub repository and push your commits:
   ```bash
   # Add your GitHub repository link as the remote origin
   git remote add origin https://github.com/YOUR_USERNAME/spss-data-processor.git
   
   # Set the branch name to main
   git branch -M main
   
   # Push the commits
   git push -u origin main
   ```
   *(Replace `YOUR_USERNAME` with your actual GitHub username).*

---

## Deploying to Google Cloud (Cloud Run)

**Google Cloud Run** is the recommended service for hosting this app. It is serverless, auto-scales, and features a free tier.

### Option 1: Deploy Directly from Git (Easiest)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Search for and navigate to **Cloud Run**.
3. Click **Create Service**.
4. Select **Continuously deploy from a git repository**.
5. Click **Set up with Cloud Build**:
   - Authenticate with your GitHub account.
   - Choose your `spss-data-processor` repository.
   - Select the `main` branch.
   - For Build Type, select **Dockerfile**.
6. Set the **Service Name** and region.
7. Under **Authentication**, select **Allow unauthenticated invocations** (so it can be accessed publicly from anywhere).
8. Click **Create** to compile, package, and deploy your site. Cloud Run will provide a public HTTPS URL.

### Option 2: Deploy from your Terminal
If you have the `gcloud` CLI installed locally:
1. Run the following command in the project root:
   ```bash
   gcloud run deploy spss-data-processor --source . --allow-unauthenticated
   ```
2. Select your target region when prompted. Google Cloud will compile the container using the provided `Dockerfile` and output your public URL.
