# Move project to a new GitHub repo

Use this when you want a **fresh repository** (e.g. for Render Blueprint or a clean history).

## 1. Create empty repo on GitHub

1. Open [github.com/new](https://github.com/new)
2. **Repository name:** e.g. `Aura-Athletic` (your choice)
3. **Public** or **Private**
4. Do **not** add README, `.gitignore`, or license (repo must stay empty)
5. Click **Create repository**

Copy the HTTPS URL, e.g. `https://github.com/Ram404-coder/Aura-Athletic.git`

## 2. Point this project at the new repo and push

From the project folder:

```bash
cd /Users/rambaranyadav/Documents/Gym_Website

# Keep old remote as backup (optional)
git remote rename origin old-origin

# Add new repo (replace with YOUR new URL)
git remote add origin https://github.com/Ram404-coder/Aura-Athletic.git

# Push all code
git push -u origin main
```

## 3. Update Render

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect the **new** repo (not `Gym_Website`)
3. Set environment variables again (they do not copy between repos)
4. Deploy URL will be `https://aura-athletic.onrender.com` (or rename service in `render.yaml`)

## 4. Clone elsewhere (optional)

On another machine:

```bash
git clone https://github.com/Ram404-coder/Aura-Athletic.git
cd Aura-Athletic/backend
cp .env.example .env   # then fill in secrets
npm install
npm start
```
