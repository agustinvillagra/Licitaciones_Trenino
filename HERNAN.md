# Instrucciones para dejarlo corriendo

Hernán: esto es un buscador de licitaciones públicas de vestuario para Trenino.
Consulta la API de Mercado Público una vez al día, filtra las que sirven, las
publica en una página web y manda un correo con las nuevas.

**Está todo construido y funcionando.** Lo único que no corre es la
actualización automática diaria, porque la cuenta de GitHub de Agustín tiene
Actions bloqueado y **los minutos de Actions se le cobran a la cuenta dueña del
repositorio, no a quien dispara la corrida**. Por eso no basta con que tú
aprietes el botón: hay que mover el repositorio a tu cuenta.

Tienes dos caminos. Lee los dos antes de empezar, el A toma cinco minutos.

---

## Antes que nada: las claves

Agustín te manda por mensaje directo un archivo **`CLAVES-para-Hernan.txt`**
con los valores de todo lo que aparece abajo como `(te lo manda Agustín)`.

Ese archivo **no está en el repositorio y no debe subirse**: el repo es público
y cualquiera podría leerlo. Si en algún momento lo copias a la carpeta del
proyecto, ya está en el `.gitignore`, así que git lo va a ignorar solo.

---

## Camino A — mantenerlo al día a mano

Si lo que quieres es simplemente que la página no se quede vieja mientras se
destraba la cuenta de Agustín, con esto basta. No usa GitHub Actions, así que
no pasa por el bloqueo ni por tu licencia.

Necesitas que Agustín te agregue como colaborador en
**Settings → Collaborators → Add people**.

```bash
git clone https://github.com/agustinvillagra/Licitaciones_Trenino.git
cd Licitaciones_Trenino
npm ci

export TICKET_MERCADO_PUBLICO=...        # te lo manda Agustín
npm run actualizar

git add public/data/
git commit -m "Licitaciones al día"
git push
```

Vercel detecta el commit y republica la página sola, en menos de un minuto.

Si además quieres que salga el correo del resumen:

```bash
export GMAIL_USUARIO=...                 # te los manda Agustín
export GMAIL_CLAVE_APP=...
export CORREO_DESTINO=...
export CORREO_ORIGEN=...
npm run correo
```

**Esto nos sirve especialmente:** el envío por Gmail nunca se ha podido probar
—el entorno donde se programó tiene los puertos SMTP bloqueados y la corrida
automática nunca arrancó—. Si lo corres y llega el correo, queda confirmado. Si
falla, el script imprime exactamente qué pasó.

Correrlo una vez al día, o cada dos o tres días, mantiene la página útil.

---

## Camino B — dejarlo corriendo solo en tu cuenta

Esto replica el proyecto completo bajo tu cuenta, con el cron diario andando.
Son unos 20 minutos.

### 1. Fork del repositorio

Entra a <https://github.com/agustinvillagra/Licitaciones_Trenino> y aprieta
**Fork**. Déjalo público: en repos públicos los minutos de Actions son gratis.

### 2. Los secretos

En **tu** fork: **Settings → Secrets and variables → Actions**.

Ojo que la página tiene dos pestañas, *Secrets* y *Variables*, y no da lo
mismo. Los secretos se ocultan después de guardarlos; las variables se ven.

En la pestaña **Secrets**, con *New repository secret*:

| Nombre | Qué es |
|---|---|
| `TICKET_MERCADO_PUBLICO` | Ticket de la API de ChileCompra *(te lo manda Agustín)* |
| `GMAIL_USUARIO` | La cuenta que envía los correos *(te lo manda Agustín)* |
| `GMAIL_CLAVE_APP` | Contraseña **de aplicación** de 16 caracteres de esa cuenta, no la del correo *(te la manda Agustín)* |
| `CORREO_DESTINO` | Los destinatarios, separados por coma *(te lo manda Agustín)* |

En la pestaña **Variables**, con *New repository variable*:

| Nombre | Qué es |
|---|---|
| `CORREO_ORIGEN` | El remitente que ve quien recibe el correo *(te lo manda Agustín)* |
| `SITIO_URL` | La URL que te dé Vercel en el paso 3. **Este lo pones después** |

### 3. Vercel

1. Entra a <https://vercel.com> con tu cuenta de GitHub.
2. **Add New → Project** e importa tu fork.
3. No cambies nada de la configuración. El archivo `vercel.json` ya dice que el
   sitio es estático y que la carpeta a publicar es `public/`. Si te pregunta
   por *Framework Preset*, déjalo en **Other**; el *Root Directory* se queda en
   la raíz. No hay comando de build.
4. **Deploy.** Te va a dar una URL tipo `https://licitacionestrenino.vercel.app`.
5. Vuelve a GitHub y pon esa URL en la variable `SITIO_URL`. Es la que usa el
   botón del correo.

### 4. La base de datos de las marcas

En la página se puede marcar cada licitación como favorita, postulada o
descartada. Para que esas marcas se compartan entre todos —y no queden solo en
tu navegador— hace falta una base.

En el proyecto de Vercel: **Storage → Create Database → Upstash for Redis**,
plan gratis. Al conectarla al proyecto, Vercel inyecta solo las variables
`KV_REST_API_URL` y `KV_REST_API_TOKEN`, que es exactamente lo que el código
espera. No hay que instalar ningún paquete ni copiar nada a mano.

**Un detalle que conviene no pasar por alto:** las marcas que ya existan viven
en la base conectada al proyecto de Agustín. Si creas una base nueva, partes de
cero. Hoy da lo mismo porque casi no hay marcas, pero si más adelante ya hay
historial de postulaciones, conviene conservar la base original en vez de crear
otra.

Sin base el sitio funciona igual, solo que las marcas no se comparten y la
página lo avisa arriba.

### 5. Primera corrida

En tu fork, pestaña **Actions**. GitHub deshabilita los workflows de los forks
por defecto, así que lo primero es apretar **"I understand my workflows, go
ahead and enable them"**.

Después elige *Actualizar licitaciones* en la lista de la izquierda y aprieta
**Run workflow**. Debería tomar un minuto.

Si salió bien vas a ver:
- un commit nuevo del bot tocando `public/data/`,
- la página con las licitaciones al día,
- y el correo en la bandeja de los destinatarios.

De ahí en adelante corre solo **todos los días a las 08:00 de Chile**.

---

## Si algo falla

**El workflow falla en el paso de actualizar.** Casi siempre es el ticket. En
el log busca `401` o `Codigo: 10500`: el primero es ticket inválido, el segundo
es que la API nos está limitando y conviene reintentar más tarde.

**El workflow dice que se completó pero no llegó el correo.** Es a propósito:
el correo es un aviso, no el trabajo principal, así que si falla el envío la
corrida igual guarda los datos. Busca `::warning::No se pudo enviar el correo`
en el log; abajo sale el motivo traducido a algo accionable. Si dice `EAUTH`,
la contraseña de aplicación está mal. Si dice `ESOCKET`, es la red, no la
contraseña.

**No llegó correo y el log no dice nada.** Puede ser lo correcto: el script no
manda nada si no hay licitaciones nuevas, para no volverse ruido. En el log
debería decir `Sin licitaciones nuevas hoy`.

**La página dice "base compartida sin conectar".** Falta el paso 4, o la base
se creó pero no se conectó a este proyecto en Vercel. Para ver qué variables
está recibiendo, abre `https://tu-sitio.vercel.app/api/diagnostico`.

**El workflow dejó de correr solo después de un tiempo.** GitHub desactiva los
crons de repos sin actividad. Como este commitea todos los días, no debería
pasar, pero si pasa se vuelve a activar desde la pestaña Actions.

---

## Qué conviene entender del proyecto

No hace falta para dejarlo corriendo, pero ayuda si después hay que tocarlo.

**El archivo que de verdad importa es [`lib/filtros.mjs`](lib/filtros.mjs).**
Ahí están las reglas que deciden si una licitación es escolar, corporativa o no
sirve. Está comentado y es el único archivo a editar si cambian los criterios.
A grandes rasgos: el nombre tiene que mencionar una prenda; se descartan
servicios y obras (lavado, mantención, arriendo); se descartan academias
policiales y militares y el uniforme clínico; si el texto apunta a alumnos es
escolar, si no es corporativo.

Ese filtro es **más inclusivo** que el del análisis de mercado del informe, a
propósito: allá importaba no inflar el tamaño del canal, acá importa no perder
una licitación. Un falso positivo cuesta diez segundos de lectura, una
licitación perdida cuesta la venta.

**El resto del flujo** es simple: el script pide a la API todas las activas en
una sola llamada, filtra, baja el detalle solo de las que no conocía, y escribe
`public/data/licitaciones.json`. Las que desaparecen de la lista activa se
archivan en `historial.json`, que guarda 18 meses — así no se pierde el rastro
de a cuáles se postuló.

**Tres llamadas en paralelo como máximo.** Con más, la API responde 429.

**Si le agregas campos al registro de una licitación**, hay que subir
`VERSION_ESQUEMA` en `scripts/actualizar.mjs`. Si no, el script reusa los
registros viejos sin el campo nuevo y queda a medias.

El [`README.md`](README.md) tiene el detalle completo.

---

## Lo que queda pendiente

1. **Probar el envío por Gmail.** Es lo único del sistema que nunca se ha
   verificado. Si corres `npm run correo` o el workflow, se resuelve.
2. **Rotar la clave de aplicación de Gmail y la de Resend.** Pasaron por chat,
   así que conviene generar nuevas cuando esto quede andando:
   *myaccount.google.com → Seguridad → Contraseñas de aplicaciones*.
3. **Decidir dónde vive el proyecto.** Si a Agustín le devuelven la licencia, su
   cron arranca solo sin tocar nada y tu fork queda de respaldo. Si no, el tuyo
   pasa a ser el oficial y conviene apuntar ahí a todos.
