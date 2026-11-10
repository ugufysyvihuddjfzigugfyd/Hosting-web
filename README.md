# MAHIR HOSTING - Ultimate VPS Management Panel

## Login Credentials
- **Username:** `MAHIR`
- **Password:** `MAHIR HOSTING`

(Railway Variables দিয়েও override করা যায়: `PANEL_SECRET` = password)

## Fixes in this build
1. Default login changed to **MAHIR / MAHIR HOSTING**
2. File upload now **force-overwrites** same-name files (আগের ফাইলের সাথে মিশে না / stale content থাকে না)
3. Upload uses **basename only** (path traversal blocked)
4. File save uses **atomic write** (tmp + os.replace) so content always fully updates
5. Frontend file list + editor **cache-bust** after upload so UI immediately shows new size/content
6. Proper `templates/` + `static/` layout for Flask

## Run locally
```bash
pip install -r requirements.txt
python app.py
# open http://127.0.0.1:5000
```

## Railway
- Builder: NIXPACKS (railway.json already set)
- Start: gunicorn via Procfile
- Set env `PANEL_SECRET=MAHIR HOSTING` if you want env-based password

## Structure
```
app.py
Procfile
railway.json
requirements.txt
env_patch.py
templates/
  index.html
  login.html
  premium_style.css
static/
  app.js
servers_db.json
```
