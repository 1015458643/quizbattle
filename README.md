# 🎮 QuizBattle

Juego de preguntas multijugador en tiempo real, inspirado en Kahoot!, hecho **100 % con HTML, CSS y JavaScript** (sin servidor, sin compilación). Se publica directo en **GitHub Pages**.

- 📺 **Anfitrión:** proyecta el juego en la pantalla grande (PIN gigante + código QR).
- 📱 **Jugadores:** entran desde el celular escaneando el QR o escribiendo el PIN.
- 🔗 **Conexión P2P (WebRTC)** con [PeerJS](https://peerjs.com) + respaldo `BroadcastChannel` para probar con varias pestañas del mismo navegador.
- 🔊 **Todos los sonidos y la música se sintetizan** con Web Audio API (sin archivos .mp3).

## 📁 Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de todas las pantallas |
| `styles.css` | Identidad visual (morado, botones 3D, animaciones, podio) |
| `audio.js` | Motor de audio sintetizado (música, pop, tictac, gong, fanfarria) |
| `app.js` | Lógica del anfitrión, jugadores, red, puntajes y confeti |
| `README.md` | Este archivo |

## 🚀 Publicar en GitHub Pages (paso a paso)

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Clic en **New repository** (botón verde **+ → New repository**).
3. Ponle un nombre, por ejemplo `quizbattle`, márcalo como **Public** y clic en **Create repository**.
4. En la página del repositorio vacío, clic en **uploading an existing file**.
5. Arrastra los 5 archivos (`index.html`, `styles.css`, `audio.js`, `app.js`, `README.md`) y clic en **Commit changes**.
6. Ve a **Settings → Pages**.
7. En **Build and deployment → Source** elige **Deploy from a branch**.
8. En **Branch** elige **main** y la carpeta **/ (root)**. Clic en **Save**.
9. Espera 1–2 minutos y recarga la página: aparecerá tu URL, del estilo
   `https://TU-USUARIO.github.io/quizbattle/`

> **Con Git desde la terminal** (alternativa):
> ```bash
> git init
> git add .
> git commit -m "QuizBattle"
> git branch -M main
> git remote add origin https://github.com/TU-USUARIO/quizbattle.git
> git push -u origin main
> ```
> Luego activa Pages en **Settings → Pages → Deploy from branch → main**.

## 🕹 Cómo jugar

1. **Anfitrión:** abre la URL en el computador conectado al proyector → **Soy el anfitrión**.
2. Edita el quiz (viene uno de 5 preguntas listo) y pulsa **▶ Jugar**.
3. **Jugadores:** escanean el QR (o abren la URL y escriben el PIN), eligen apodo y avatar.
4. Cuando todos estén en el lobby, pulsa **Comenzar ▶**.
5. Cada ronda: cuenta regresiva → pregunta con temporizador → gráfico de respuestas → marcador Top 5.
6. Al final, podio con 3°, 2° y 1° lugar, confeti y **Jugar de nuevo**.

### Puntaje
- Respuesta correcta: **500 a 1000 pts** según la rapidez.
- **Bono por racha:** +100 por cada acierto consecutivo a partir del segundo (máx. +500).
- Respuesta incorrecta o sin responder: 0 pts y se reinicia la racha.

## ✏ Editor de quizzes
- Crear, editar y eliminar preguntas; tiempo de 10, 20 o 30 s.
- Marcar la respuesta correcta con ✔.
- Imagen opcional por pregunta (pega cualquier URL `https://`).
- **Exportar / Importar** en `.json` para guardar quizzes en tu repositorio o compartirlos.
- El quiz se guarda automáticamente en el navegador (localStorage).

Formato del `.json`:
```json
{
  "title": "Mi quiz",
  "questions": [
    {
      "text": "¿Capital de Colombia?",
      "options": ["Medellín", "Bogotá", "Cali", "Cartagena"],
      "correct": 1,
      "time": 20,
      "image": "https://upload.wikimedia.org/…/imagen.jpg"
    }
  ]
}
```

## 🧪 Probar sin celulares
Abre la página del anfitrión en una pestaña y, en **otras pestañas del mismo navegador**, abre `…/?pin=XXXXXX` con el PIN mostrado. El respaldo `BroadcastChannel` las conecta aunque la red bloquee WebRTC.

## ⚠ Notas
- La conexión entre dispositivos usa el servidor público gratuito de señalización de PeerJS y luego viaja directo (P2P). Algunas redes corporativas o universitarias bloquean WebRTC; si pasa, prueba con los datos móviles o una red de casa.
- Para escuchar los sonidos, el navegador exige un toque/clic previo (por eso el audio arranca al pulsar un botón). Usa el botón 🔊 flotante para silenciar.
- El anfitrión no debe cerrar ni recargar su pestaña durante la partida: él guarda los puntajes.
