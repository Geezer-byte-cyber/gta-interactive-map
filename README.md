# Los Santos Field Guide — free-hosted GTA V map starter

A responsive interactive map site built with React, Leaflet and Supabase. Visitors can browse and filter public pins. A signed-in admin can add, move, edit and delete pins and upload pin images.

## What is included

- Leaflet image-overlay map with pan/zoom (uses a local coordinate plane, not paid map tiles)
- Public map pins and popup notes
- Category colours, search and category filters
- Supabase email/password admin login
- Supabase database with row-level security (public read; authenticated write)
- Public image bucket for pin attachments
- Cloudflare Pages deployment-ready Vite app

## 1. You need a GTA V map image

This project intentionally does **not** bundle Rockstar's map artwork. Get a high-resolution, top-down map image that you have permission to use. Prefer a clean rectangular image without UI overlays. PNG or JPG works.

For this starter, the map image must be uploaded as a static asset at `public/los-santos-map.jpg` (create the `public` folder if needed), and the app's map display will load it automatically after the small code change below. You can use your own legally usable image. If you use a community-created map, check its licence and attribution requirements.

In `src/App.jsx`, replace:
```js
const [mapUrl,setMapUrl]=useState(localStorage.getItem('gta-map-image')||'');
```
with:
```js
const [mapUrl,setMapUrl]=useState('/los-santos-map.jpg');
```
Then put your image at `public/los-santos-map.jpg`. The “Map image” button is only a temporary local preview helper; use the static asset method above to publish the background consistently to every viewer. The map image is scaled to a 1600 × 1000 coordinate plane; Leaflet handles pan and zoom.

**Important:** this first version uses a rectangular image overlay. Pins are stored in image coordinates, so replacing the map image or changing its crop/aspect ratio later will shift pins.

## 2. Create your free Supabase project

1. Create a project at https://supabase.com/ (choose the free plan).
2. In Project Settings → API, copy the Project URL and the publishable key (or legacy anon key). Never put the `service_role` / secret key in this website.
3. Open SQL Editor, create a new query, paste all of `supabase/schema.sql`, and run it.
4. In Authentication → Providers, ensure Email is enabled.
5. In Authentication → Settings / URL Configuration, set your site URL after deployment. Disable public sign-ups (or leave sign-ups disabled) so only the admin user you create can log in.
6. In Authentication → Users, create your own user with an email and strong password. This is your admin login.

The supplied RLS policies allow any authenticated account to edit. This is safe only if you keep public sign-ups disabled and do not invite other users. For a more hardened multi-admin setup, replace these policies with an explicit allow-list of admin user UUIDs.

## 3. Configure the app locally

Install Node.js 20 or newer. In this project folder:

```bash
cp .env.example .env
```

Edit `.env` and add the Supabase Project URL and publishable/anon key. Then run:

```bash
npm install
npm run dev
```

Open the local URL Vite prints. Before Supabase is configured, the interface renders but shared pin storage and login are unavailable.

## 4. Deploy free with Cloudflare Pages

1. Push this folder to a GitHub repository.
2. In Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git, choose the repository.
3. Framework preset: **Vite**. Build command: `npm run build`. Build output directory: `dist`.
4. In the Pages project Settings → Variables and Secrets, add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key
5. Trigger a new deployment.
6. Copy the `*.pages.dev` URL into Supabase Authentication → URL Configuration as the Site URL and add it to the Redirect URLs list.

The anon/publishable key is designed for browser use. Security comes from Supabase RLS policies, not from hiding that key. Never expose the service-role/secret key.

## 5. How to use it

- Visit your public Pages URL.
- Select **Admin login** and sign in with the user you created.
- Choose **Map image** for a temporary preview, or publish your map as `public/los-santos-map.jpg` as described above.
- Select **Add pin**, click the map where the pin belongs, enter a title, category and notes, optionally upload an image, then save.
- Click an existing pin while signed in to edit or delete it.
- Viewers can search and filter pins but cannot modify them.

## Free-plan caveats

The hosting and database providers have free tiers, not unlimited lifetime guarantees. Free-tier quotas, inactivity pauses, storage, bandwidth and terms can change. This project does not use paid map tiles or a paid mapping API. A custom domain is optional and usually costs money; use the free `pages.dev` subdomain.

## Copyright / fan-project note

Grand Theft Auto and related game assets are owned by their respective rights holders. This is an unofficial fan project and is not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Use only map imagery you are permitted to publish; this repository does not include Rockstar map art.
