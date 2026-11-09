# PatoBarato Admin

Admin portal (Next.js) for managing offers, coupons, guides, events and users. Users sign in with
Supabase Auth (email + password). Accounts are created only by invitation, and every table is gated by RLS
on membership in `admin_users`.

## Development

```
cp .env.example .env.local   # fill in the three NEXT_PUBLIC_* variables
npm install
npm run dev
npm run lint && npm run typecheck && npm test && npm run build
```

## Manual setup (Supabase and Vercel)

1. Supabase, Authentication > Sign In / Providers: disable «Allow new users to sign up».
2. Supabase, Authentication > URL Configuration: set Site URL to the admin URL and add
   `<admin-url>/auth/confirm` to Redirect URLs.
3. Supabase, Authentication > Email Templates: change the Invite and Reset Password templates so the link is
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (Invite) and
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (Reset Password).
4. Invite yourself from the Supabase dashboard (Authentication > Users > Invite user), then insert the first owner:

   ```sql
   insert into admin_users (user_id, email, is_owner) select id, email, true from auth.users where email = '<owner>';
   ```

5. Create the Vercel project with Root Directory `admin` and the three variables
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_WEB_URL`.

## Prueba de extremo a extremo

Manual, contra el proyecto real, con el bot en marcha y un canal de pruebas como `TARGET_CHANNEL`:

- [ ] Invitar a un segundo email y aceptar la invitación.
- [ ] Pegar un enlace de Amazon, revisar el borrador y publicarlo.
- [ ] Cambiar el precio y comprobar la publicación de Telegram y la página web tras recargar.
- [ ] Terminar la oferta y comprobar la cabecera de la publicación y que el chollo ha desaparecido de la web.
- [ ] Copiar la imagen y el texto de WhatsApp en escritorio y compartir desde un móvil.
- [ ] Anotar los resultados.
