# Move project to a new GitHub repo

Current repo: **https://github.com/Ram404-coder/gym_website**

(GitHub treats `gym_website` and `Gym_Website` as the same repository.)

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
