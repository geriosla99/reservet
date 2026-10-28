# Reservet · Solución de la prueba técnica

Aplicación para personal de restaurante: inicio de sesión, gestión de mesas (listar, crear y
cambiar estado) y persistencia en PostgreSQL real, con interfaz en español, inglés y ruso.

> El enunciado original de la prueba está en [`docs/ENUNCIADO_PRUEBA.md`](docs/ENUNCIADO_PRUEBA.md).
> Este README documenta la solución, cómo ejecutarla y cómo se verificó.

**Estado:** login, logout y consulta de sesión; endpoints de mesas protegidos en el servidor;
interfaz conectada; 32 pruebas (13 sin base de datos y 19 de integración con PostgreSQL real);
CI en GitHub. **No se usa Docker.**

## 1. Requisitos

- Node.js 22.13 o superior (`engines` de `package.json`; desarrollado con Node 24).
- PostgreSQL instalado localmente (puerto 5432).
- Windows con PowerShell (los comandos de abajo están escritos para PowerShell).

## 2. Puesta en marcha desde cero

### 2.1 Dependencias

```powershell
git clone https://github.com/TU_USUARIO/reservet-prueba-tecnica.git
cd reservet-prueba-tecnica
git switch feat/technical-test   # o la rama final indicada en la entrega
npm ci
```

### 2.2 PostgreSQL: rol y bases

Ejecuta cada sentencia por separado, como administrador (por ejemplo, en pgAdmin sobre la base
`postgres`). Comprueba antes si ya existen: no recrees objetos existentes. Usa una contraseña
local propia en lugar del ejemplo.

```sql
CREATE ROLE reservet_candidate LOGIN PASSWORD 'local_candidate_password';
CREATE DATABASE reservet_candidate OWNER reservet_candidate;
CREATE DATABASE reservet_candidate_test OWNER reservet_candidate;
```

### 2.3 Variables de entorno

Crea un archivo `.env` en la raíz (está en `.gitignore`; nunca se sube) a partir de
`.env.example`:

| Variable                         | Obligatoria                 | Descripción                                                                                                      |
| -------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | Sí                          | Base de trabajo. Ej.: `postgresql://reservet_candidate:CLAVE@localhost:5432/reservet_candidate`                  |
| `PORT`                           | No                          | Puerto HTTP (3000 por defecto).                                                                                  |
| `HOST`                           | No                          | `127.0.0.1` (por defecto) o `0.0.0.0`.                                                                           |
| `APP_ENV`                        | No                          | `dev` (por defecto) o `pro`. En `pro` la cookie de sesión añade `Secure`.                                        |
| `TEST_DATABASE_URL`              | Para pruebas de integración | Base de pruebas; su nombre **debe terminar en `_test`**.                                                         |
| `SEED_USERNAME`, `SEED_PASSWORD` | Solo para `npm run db:seed` | Credenciales del usuario de prueba (8–200 caracteres). Se pasan al ejecutar el comando, no se guardan en `.env`. |

Una variable ya definida en la sesión de PowerShell **tiene prioridad** sobre `.env`
(`dotenv` no sobrescribe). Si la app lee un usuario que no esperas, revisa
`Get-ChildItem Env:DATABASE*`.

### 2.4 Migraciones, usuario de prueba y arranque

```powershell
npm run db:migrate

$env:SEED_USERNAME = 'demo'
$env:SEED_PASSWORD = 'TU_CLAVE_LOCAL'      # elige tu propia clave de prueba
npm run db:seed
Remove-Item Env:SEED_USERNAME, Env:SEED_PASSWORD

npm run dev
```

Comprueba en otra terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health      # status: ok
Invoke-RestMethod http://localhost:3000/health/db   # database: connected
```

Abre `http://localhost:3000`, elige **Mi API local** e inicia sesión con el usuario sembrado.
El modo **Demostración** guarda solo en memoria y no prueba la persistencia.
`npm run db:seed` es repetible: si el usuario existe, actualiza su contraseña.
**No uses `npm run db:up` ni `db:down`** (son para Docker).

## 3. Comandos

| Comando              | Qué hace                                                              |
| -------------------- | --------------------------------------------------------------------- |
| `npm run dev`        | Servidor con recarga automática.                                      |
| `npm run db:migrate` | Aplica migraciones pendientes (cada una en su transacción).           |
| `npm run db:seed`    | Crea o actualiza el usuario de prueba.                                |
| `npm test`           | Todas las pruebas (las de integración requieren `TEST_DATABASE_URL`). |
| `npm run check`      | Lint, formato, tipos, pruebas y compilación.                          |
| `npm run format`     | Formatea con Prettier.                                                |

## 4. API

Los errores usan `{ code, message, requestId }` (también en la cabecera `X-Request-Id`),
sin detalles internos ni trazas.

| Método y ruta                  | Auth | Respuestas                                                                         |
| ------------------------------ | ---- | ---------------------------------------------------------------------------------- |
| `POST /api/auth/login`         | No   | 200 `{ user }` + cookie · 400 `VALIDATION_ERROR` · 401 `INVALID_CREDENTIALS`       |
| `POST /api/auth/logout`        | No   | 204 y cookie expirada; revoca la sesión en el servidor                             |
| `GET /api/auth/session`        | Sí   | 200 `{ user }` · 401 `UNAUTHENTICATED`                                             |
| `GET /api/tables`              | Sí   | 200 lista de mesas ordenada por `id`                                               |
| `POST /api/tables`             | Sí   | 201 mesa creada (`available`) · 400 `VALIDATION_ERROR` · 409 `TABLE_NAME_CONFLICT` |
| `PATCH /api/tables/:id/status` | Sí   | 200 mesa actualizada · 400 `VALIDATION_ERROR` · 404 `TABLE_NOT_FOUND`              |

Reglas: nombre de 1 a 80 caracteres (se recortan espacios), capacidad **entera de 1 a 20**
(se rechaza `"4"` como texto y `2.5`), estado `available`, `occupied` u `out_of_service`,
`id` entero positivo que quepa en un `integer` de PostgreSQL. `/health` y `/health/db` son públicos.

## 5. Arquitectura y flujo

```text
Navegador ── POST /api/auth/login ──► auth.routes ► auth.service ► auth.repository ► users
              ◄── Set-Cookie: reservet_session (HttpOnly, SameSite=Strict) ── sessions (hash del token)

Navegador ── GET /api/tables + cookie ──► requireAuth ──► tables.routes
                                              │  auth.service.getSession ► sessions JOIN users
                                              ▼  (401 si no hay sesión válida)
                              tables.service (validación) ► tables.repository (SQL parametrizado) ► restaurant_tables
```

Responsabilidades: **rutas** (HTTP), **servicio** (reglas y validación, errores `HttpError`),
**repositorio** (SQL parametrizado, sin lógica de negocio), **middleware** (autenticación).
`src/modules/auth` y `src/modules/tables` siguen la misma estructura.

## 6. Decisiones técnicas y seguridad

- **Sesión con cookie, no JWT.** El cierre de sesión borra la fila en el servidor y la cookie
  deja de servir al instante. Con JWT habría que mantener una lista de bloqueo. Cookie
  `HttpOnly` (no legible por JavaScript), `SameSite=Strict` (no se envía desde otros sitios:
  mitiga CSRF), `Path=/`, `Max-Age=28800` y `Secure` cuando `APP_ENV=pro`.
- **Caducidad absoluta de 8 horas** desde el login; las sesiones vencidas se eliminan al iniciar sesión.
- **Solo se guarda el hash SHA-256 del token** de sesión: una fuga de la base no entrega sesiones válidas.
- **Contraseñas con scrypt** (módulo `node:crypto`, sin dependencias nuevas): sal aleatoria de
  16 bytes y N=2^16, r=8, p=2, un coste equivalente al mínimo que indica OWASP
  (N=2^17, r=8, p=1). Los parámetros se guardan dentro del hash
  (`scrypt$N$r$p$sal$hash`), por lo que pueden subirse sin invalidar los existentes. La
  comparación usa `timingSafeEqual`.
- **Credenciales sin pistas:** usuario inexistente y contraseña incorrecta devuelven el mismo
  401 y mensaje; cuando el usuario no existe se verifica igualmente contra un hash falso para
  igualar el tiempo de respuesta. Longitud máxima de contraseña (200) contra abuso de CPU.
- **Nombre de usuario sin distinguir mayúsculas** (índice único sobre `lower(username)`).
- **SQL parametrizado** en todas las consultas; el nombre de mesa `x'); DROP TABLE ...` se guarda como texto (hay prueba).
- **Protección en el servidor:** todo `/api/tables` pasa por `requireAuth`. Ocultar botones en la interfaz no es seguridad.
- **Sin credenciales en Git:** el seed lee variables de entorno; `.env` está ignorado.

## 7. Pruebas

```powershell
$env:TEST_DATABASE_URL = 'postgresql://reservet_candidate:CLAVE@localhost:5432/reservet_candidate_test'
npm test
npm run check
Remove-Item Env:TEST_DATABASE_URL     # o déjala en .env
```

| Tipo                          | Archivos                                                      | Qué cubre                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integración (PostgreSQL real) | `auth.integration.test.js`, `tables.integration.test.js`      | Login correcto/incorrecto, acceso sin sesión, cookie inventada, sesión caducada, logout que revoca, crear/listar/cambiar estado, validaciones y límites, duplicados, 404, persistencia vista desde otra conexión, SQL parametrizado |
| Unitarias                     | `password.test.js`, `config.test.js`, `http.test.js`          | scrypt (sal única, hashes antiguos, hashes alterados), configuración, JSON inválido y cuerpos grandes                                                                                                                               |
| Interfaz (JSDOM, sin red)     | `ui.test.js`, `ui-search.test.js`, `i18n-persistence.test.js` | Tres idiomas, XSS en nombres, login/logout, regresiones de los defectos                                                                                                                                                             |

Las pruebas de integración **arrancan la aplicación real** y usan solo la base de
`TEST_DATABASE_URL`: se niegan a ejecutarse si su nombre no termina en `_test`, aplican las
migraciones y vacían únicamente `restaurant_tables` y sus propios usuarios. Sin la variable
se omiten con un aviso; **en CI su ausencia es un error**. Lo simulado: la interfaz usa JSDOM
y un `fetch` falso; no hay navegador real.

**CI** (`.github/workflows/ci.yml`, «Verificaciones»): `npm ci` y `npm run check` con un
contenedor PostgreSQL 17 desechable. El workflow de despliegue se omite fuera del repositorio original.

## 8. Defectos del código inicial

El código inicial era un punto de partida con defectos en la interfaz. Se revisó también el
servidor (migración, configuración, errores, apagado) y no se encontraron defectos adicionales.

### D1. No se podía crear una mesa con capacidad 20

- **Síntoma:** el formulario mostraba «Escribe un nombre… entre 1 y 20» al crear una mesa de 20 personas.
- **Reproducción:** modo Demostración → Nueva mesa → capacidad 20 → Crear.
- **Causa:** `public/app.js` validaba `capacity >= 20` en lugar de `capacity > 20`; el rango válido (README, migración, servidor) es 1–20.
- **Corrección:** comparación `> 20`.
- **Prueba de regresión:** `tests/ui.test.js` (crea una mesa de 20) y `tests/tables.integration.test.js` (límites 1 y 20 en la API).

### D2. La búsqueda distinguía mayúsculas y minúsculas

- **Síntoma:** buscar «Terraza» no devolvía mesas, pero «terraza» sí.
- **Reproducción:** escribir `Terraza` en «Buscar por nombre».
- **Causa:** el nombre de la mesa se pasaba a minúsculas, pero el texto buscado no.
- **Corrección:** `toLocaleLowerCase(locale())` también sobre el texto buscado.
- **Prueba de regresión:** `tests/ui-search.test.js` (`terraza`, `Terraza`, `TERRAZA`). Falla si se reintroduce el defecto.

### D3. El idioma elegido no se conservaba al recargar

- **Síntoma:** tras elegir inglés o ruso y recargar, la interfaz volvía a español.
- **Reproducción:** cambiar el idioma y pulsar F5.
- **Causa:** `public/i18n.js` guardaba la preferencia en `reservet.language` pero la leía de `reservet.lang`.
- **Corrección:** ambas operaciones usan `reservet.language`.
- **Prueba de regresión:** `tests/i18n-persistence.test.js`. Falla si se reintroduce el defecto.

### Problemas de entorno resueltos durante el trabajo (no son del código inicial)

- `28P01` en `npm run db:migrate`: el `.env` guardado en disco usaba el rol `reservet`, que no existía en PostgreSQL local. Se alineó con el rol `reservet_candidate` y sus bases. Lección: `dotenv` no sobrescribe variables ya definidas en la sesión.

## 9. Uso de IA

Herramientas utilizadas: **Claude (Anthropic)** y **ChatGPT (OpenAI)**. [COMPLETAR: confirma o ajusta esta lista con lo que realmente usaste.]

- **Claude:** diagnóstico de la conexión a PostgreSQL, módulo de mesas, autenticación (scrypt, sesiones, seed), pruebas de integración, workflow de CI y borrador de esta documentación.
- **ChatGPT:** revisión de cambios y propuestas de interfaz y pruebas, incluida la integración del login en el frontend.
- Todo el código se ejecutó y verificó localmente (`npm run check`) y en el CI de GitHub, y se revisó antes de confirmarlo.

**Sugerencia de IA corregida:** el código de contraseñas generado con IA declaraba que sus
parámetros de scrypt (N=2^14, r=8, p=1) eran «los recomendados por OWASP». Al contrastarlo con la guía de OWASP resultó
que estaban por debajo del mínimo (N=2^17, r=8, p=1, o un coste equivalente). Se subió a N=2^16, r=8, p=2, se midió el coste
(~0,3 s y ~64 MiB por hash), se añadió una prueba que fija los parámetros nuevos y otra que garantiza que los
hashes antiguos siguen verificándose.

**Cambios de diagnóstico descartados:** una sesión de depuración con IA dejó sin confirmar cambios en
`scripts/migrate.ts` (impresión completa de errores) y en `.env.example` (otra contraseña y puerto). Se
revisaron y se revirtieron con `git restore` antes de confirmar, porque mostraban más detalle del necesario y alteraban un archivo
que se publica. [COMPLETAR: confirma que esto coincide con lo ocurrido.]

## 10. Limitaciones y pendientes

- **Sin límite de intentos de login** (rate limiting): un atacante podría probar contraseñas; en producción haría falta limitarlos por IP/usuario.
- **Coste de scrypt por login:** ~64 MiB y ~0,3 s por intento; muchos logins simultáneos consumen memoria.
- **Sin protección CSRF con token:** se apoya en `SameSite=Strict` y en que la API usa JSON; no hay token anti-CSRF.
- **Logout en la interfaz:** si la petición de cierre falla (por ejemplo, sin red), la interfaz muestra la sesión como cerrada aunque la cookie siga válida en el servidor hasta que caduque (8 h).
- **Una sola cuenta de prueba por seed:** no hay registro, roles ni recuperación de contraseña (fuera de alcance).
- **Sin pruebas en navegador real** (solo JSDOM).
- `README.en.md` y `README.ru.md` conservan el enunciado original y no se actualizaron.

## 11. Verificación desde cero (checklist)

1. Clonar el repositorio en otra carpeta y seguir las secciones 2.1–2.4.
2. `npm run check` pasa con `TEST_DATABASE_URL` definida.
3. En `http://localhost:3000` → **Mi API local** → iniciar sesión, crear una mesa, cambiar su estado.
4. Recargar y detener/reiniciar `npm run dev`: la mesa y su estado persisten.
5. Cerrar sesión: `Invoke-RestMethod http://localhost:3000/api/tables` responde 401.
6. `git ls-files .env` no imprime nada; `git diff --check` sin errores.

## 12. Entrega

```text
Repositorio: https://github.com/TU_USUARIO/reservet-prueba-tecnica
Rama final y commit: [COMPLETAR]
Pull request: [COMPLETAR]
CI: [COMPLETAR: URL de una ejecución correcta]
Instrucciones de ejecución: secciones 2 y 11 de este README
Usuario de prueba: procedimiento de seed (sección 2.4)
Completado / pendiente: ver secciones 8 y 10
```
