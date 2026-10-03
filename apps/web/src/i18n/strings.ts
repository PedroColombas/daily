// Every piece of interface text, in each language the app speaks. One object per language, with the
// same shape — `es` is typed against `en`, so a string added to one and forgotten in the other is a
// build error rather than a blank on screen.
//
// Spanish is Spain Spanish (es-ES), addressing the reader as tú.
//
// What is NOT here: the report, catch-up and podcast, which the pipeline writes in the reader's
// language; and topic names, which live in ./topics.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const en = {
  common: {
    loading: "Loading…",
    back: "Back",
    continue: "Continue",
    save: "Save",
    cancel: "Cancel",
    remove: "Remove",
    tryAgain: "Try again",
    dismiss: "Dismiss",
  },

  language: {
    title: "Choose your language",
    blurb: "For the app, and for your briefs and podcasts.",
  },

  greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" },

  nav: { today: "Today", prefs: "Prefs", history: "History", profile: "Profile" },

  login: {
    tagline: "Your day, briefed.",
    blurb: "One personalised report each morning — your topics, summarised and ready to read or hear.",
    sentBefore: "Check your inbox — a sign-in link is on its way to ",
    sentAfter: ".",
    differentEmail: "Use a different email",
    google: "Continue with Google",
    or: "or",
    emailPlaceholder: "you@example.com",
    sending: "Sending…",
    continueEmail: "Continue with email",
    justLooking: "just looking?",
    demo: "View the demo — no signup",
    termsBefore: "By continuing you agree to our ",
    terms: "Terms",
    and: " and ",
    privacy: "Privacy Policy",
    termsAfter: ".",
  },

  welcome: {
    title: "Welcome to",
    blurb:
      "All the news you care about, every day — gathered, summarised, and shaped exactly the way that works for you.",
    start: "Get started",
    time: "Takes about a minute to set up.",
  },

  wizard: {
    steps: [
      {
        title: "Pick your areas",
        subtitle: "Broad areas to explore — you'll choose specific topics next. Up to five.",
      },
      {
        title: "Choose your topics",
        subtitle: "These become the sections of your brief — pick the ones you care about.",
      },
      { title: "Anything specific?", subtitle: "Add topics in your own words — optional." },
    ],
    stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
    review: "Review",
    capNotice: "Limit reached — deselect one to swap",
    allSet: "All set",
    previewTitle: "Here's tomorrow's edition",
    previewBlurb:
      "Here's what your brief will cover. Drag to reorder, tap to edit, or remove any you don't want.",
    podcast: "Podcast",
    podcastOn: "On · daily audio version",
    podcastOff: "Off · text only",
    inThisEdition: "In this edition",
    needOne: "Add at least one topic to continue — go back and pick a subtopic or add your own.",
    startReading: "Start reading",
  },

  topics: {
    count: (n: number, max: number) => `${n} of ${max} topics`,
    deleteToAdd: "Delete one to add more",
    add: "+ Add topic",
    deleteAria: (label: string) => `Delete ${label}`,
    ownWords: "Your own words",
    addTitle: "Add a topic",
    editTitle: "Edit topic",
    fromGenre: "From a genre",
    genre: "Genre",
    subtopic: "Subtopic",
    pickFocus: (genre: string) => `Pick a focus within ${genre} — or add it in your own words instead.`,
    topic: "Topic",
    placeholderLong: "Anything, in your own words — e.g. what China is doing in chip development",
    placeholder: "e.g. what China is doing in chip development",
    removeInterestAria: "Remove interest",
    addInterest: "+ Add an interest",
    pickGenreFirst: "Pick a genre first to see subtopic suggestions.",
    finding: "Finding subtopics…",
  },

  today: {
    loading: "Loading your brief…",
    failedTitle: "That brief didn’t come through",
    failedFallback: "Something went wrong while generating it.",
    staleTitle: (date: string) => `This brief is from ${date}`,
    staleBody: "Today’s takes about 3–4 minutes to write.",
    getToday: "Get today’s",
    meta: (topics: number, minutes: number) =>
      `Your brief · ${plural(topics, "topic", "topics")} · ${minutes} min read`,
    listen: "Listen to today's brief",
    audio: "Audio",
    minutes: (n: number) => `${n} min`,
    aiNarration: "AI narration",
    preparing: "Preparing your podcast…",
    onItsWay: "The audio version is on its way",
    retryPodcast: "Try the podcast again",
    makePodcast: "Make today's podcast",
    podcastBlurb: "A conversational audio version · takes a couple of minutes",
    forYou: "For you",
    newTopic: "New topic",
    sources: (n: number) => plural(n, "source", "sources"),
    emptyTitle: "You're all set",
    emptyAtBefore: "Your first brief will land tomorrow at ",
    emptyMorning: "Your first brief will land tomorrow morning",
    emptyAfter: ". Want to see it now?",
    generate: "Generate today's brief",
    takes: "Takes about 3–4 minutes.",
    compilingTitle: "Compiling your brief…",
    compilingBody:
      "Gathering today's news and writing it up — this usually takes about 3–4 minutes, and it'll appear here on its own. You can leave this screen; it'll be here when you're back.",
    compilingAria: "Compiling",
    errorTitle: "That didn't come through",
    errorFallback: "Your brief didn't finish generating — it may have stalled. Give it another go.",
    tips: {
      briefTitle: "This is your brief",
      briefBody:
        "Each card is a topic you chose, rewritten from today's news. Tap any card to read it in full.",
      recapTitle: "While you were away",
      recapBody: "When you've been away, your brief opens with a quick catch-up on what you missed.",
      podcastTitle: "Listen, don't just read",
      podcastBody: "Your brief as a conversation — tap to play, or expand it for chapters and speed.",
    },
  },

  recap: {
    title: "While you were away",
    days: (n: number) => plural(n, "day", "days"),
    less: "Show less",
    more: "Read more",
  },

  report: {
    back: "Back",
    textSize: "Text size",
    share: "Share",
    notFound: "We couldn't find that report.",
    notReady: "This report isn't ready yet.",
    title: "Your brief",
    topics: (n: number) => plural(n, "topic", "topics"),
    sources: (n: number) => `Sources · ${n}`,
  },

  prefs: {
    title: "Preferences",
    loading: "Loading your preferences…",
    saving: "Saving…",
    saved: "Saved",
    saveError: "Couldn't save",
    topicsLabel: "Your topics",
    topicsBlurb: "Each is a section in your brief. Drag to reorder, tap to edit, or add your own.",
    demoNote: "Have a play — you're in the demo, changes here aren't saved.",
    deliveryTitle: "Delivery time",
    deliveryBlurb: "When your brief lands each day, in your local time",
    podcastTitle: "Daily podcast",
    podcastBlurb: "A conversational audio version of your report",
    languageTitle: "Language",
    languageBlurb: "For the app now, and your briefs from the next one",
    appearanceTitle: "Appearance",
    followingDevice: "Following your device",
    alwaysLight: "Always light",
    alwaysDark: "Always dark",
    themeAuto: "Auto",
    themeLight: "Light",
    themeDark: "Dark",
    replayTitle: "See how this was set up",
    replayBlurb: "Walk through the setup wizard again",
    regenDone: "Regenerating today's brief — it'll appear on Today in a minute or two.",
    regenTitle: "Topics changed",
    regenBody:
      "Today's brief used your previous topics. Regenerate it now, or your changes apply from tomorrow.",
    regenStarting: "Starting…",
    regenNow: "Regenerate today",
    regenWait: "Wait till tomorrow",
    tips: {
      topicsTitle: "Your topics",
      topicsBody: (max: number) =>
        `These are the sections of your brief. Drag to reorder, tap to edit, or add up to ${max}.`,
      deliveryTitle: "Delivery time",
      deliveryBody: "Choose when your brief lands each morning, in your local time.",
      podcastTitle: "Daily podcast",
      podcastBody: "Turn on an audio version and it'll appear on Today, ready to play.",
    },
  },

  history: {
    title: "History",
    weekdays: ["M", "T", "W", "T", "F", "S", "S"],
    prevMonth: "Previous month",
    nextMonth: "Next month",
    tapDate: "Tap a date to open its report",
    recent: "Recent reports",
    saved: (n: number) => `${n} saved`,
    empty: "Your past reports will appear here.",
    topics: (n: number) => plural(n, "topic", "topics"),
    read: "Read",
    tips: {
      calendarTitle: "Every brief is saved",
      calendarBody:
        "Highlighted days have a brief — tap one to reopen it. Use the arrows to browse past months.",
      listTitle: "Open any day's brief",
      listBody:
        "Tap a card to read that day's brief. An accent bar marks unread ones; the mic icon means it has a podcast.",
    },
  },

  profile: {
    title: "Profile",
    signedIn: "Signed in",
    account: "Daily account",
    signOut: "Sign out",
    footnote: "Delivery time, notifications, and appearance settings will live here.",
  },

  player: {
    title: "Your Daily Report",
    cover: "Daily Report",
    nowPlaying: "Now Playing",
    meta: (minutes: number) => `AI narration · ${minutes} min`,
    expand: "Expand player",
    collapse: "Collapse player",
    play: "Play",
    pause: "Pause",
    back15: "Back 15 seconds",
    forward15: "Forward 15 seconds",
  },

  coach: { skip: "Skip", next: "Next", done: "Got it" },

  demo: { banner: "Demo · sample briefs, generating new ones is switched off" },

  delivery: { aria: "Delivery time" },
};

export type Strings = typeof en;

const es: Strings = {
  common: {
    loading: "Cargando…",
    back: "Atrás",
    continue: "Continuar",
    save: "Guardar",
    cancel: "Cancelar",
    remove: "Quitar",
    tryAgain: "Reintentar",
    dismiss: "Cerrar",
  },

  language: {
    title: "Elige tu idioma",
    blurb: "Para la app, y para tus resúmenes y podcasts.",
  },

  greeting: { morning: "Buenos días", afternoon: "Buenas tardes", evening: "Buenas noches" },

  nav: { today: "Hoy", prefs: "Ajustes", history: "Historial", profile: "Perfil" },

  login: {
    tagline: "Tu día, resumido.",
    blurb: "Un resumen personalizado cada mañana: tus temas, listos para leer o escuchar.",
    sentBefore: "Revisa tu correo: te hemos enviado un enlace para entrar a ",
    sentAfter: ".",
    differentEmail: "Usar otro correo",
    google: "Continuar con Google",
    or: "o",
    emailPlaceholder: "tu@ejemplo.com",
    sending: "Enviando…",
    continueEmail: "Continuar con correo",
    justLooking: "¿solo quieres echar un vistazo?",
    demo: "Ver la demo, sin registrarte",
    termsBefore: "Al continuar, aceptas nuestros ",
    terms: "Términos",
    and: " y nuestra ",
    privacy: "Política de privacidad",
    termsAfter: ".",
  },

  welcome: {
    title: "Te damos la bienvenida a",
    blurb:
      "Todas las noticias que te importan, cada día: recopiladas, resumidas y adaptadas exactamente a ti.",
    start: "Empezar",
    time: "Se configura en un minuto.",
  },

  wizard: {
    steps: [
      {
        title: "Elige tus áreas",
        subtitle: "Áreas generales para explorar; después elegirás temas concretos. Hasta cinco.",
      },
      {
        title: "Elige tus temas",
        subtitle: "Serán las secciones de tu resumen: elige los que te interesen.",
      },
      { title: "¿Algo en concreto?", subtitle: "Añade temas con tus propias palabras. Opcional." },
    ],
    stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
    review: "Revisar",
    capNotice: "Has llegado al límite: quita uno para cambiarlo",
    allSet: "Todo listo",
    previewTitle: "Así será la edición de mañana",
    previewBlurb:
      "Esto es lo que cubrirá tu resumen. Arrastra para reordenar, toca para editar o quita lo que no quieras.",
    podcast: "Podcast",
    podcastOn: "Activado · versión en audio diaria",
    podcastOff: "Desactivado · solo texto",
    inThisEdition: "En esta edición",
    needOne: "Añade al menos un tema para continuar: vuelve atrás y elige un subtema o añade uno propio.",
    startReading: "Empezar a leer",
  },

  topics: {
    count: (n: number, max: number) => `${n} de ${max} temas`,
    deleteToAdd: "Borra uno para añadir más",
    add: "+ Añadir tema",
    deleteAria: (label: string) => `Borrar ${label}`,
    ownWords: "Con tus palabras",
    addTitle: "Añadir un tema",
    editTitle: "Editar tema",
    fromGenre: "De un área",
    genre: "Área",
    subtopic: "Subtema",
    pickFocus: (genre: string) => `Elige un enfoque dentro de ${genre}, o escríbelo con tus palabras.`,
    topic: "Tema",
    placeholderLong: "Lo que quieras, con tus palabras; p. ej., qué está haciendo China con los chips",
    placeholder: "p. ej., qué está haciendo China con los chips",
    removeInterestAria: "Quitar interés",
    addInterest: "+ Añadir un interés",
    pickGenreFirst: "Elige primero un área para ver sugerencias de subtemas.",
    finding: "Buscando subtemas…",
  },

  today: {
    loading: "Cargando tu resumen…",
    failedTitle: "Ese resumen no ha llegado",
    failedFallback: "Algo ha fallado al prepararlo.",
    staleTitle: (date: string) => `Este resumen es del ${date}`,
    staleBody: "El de hoy tarda unos 3–4 minutos en escribirse.",
    getToday: "Ver el de hoy",
    meta: (topics: number, minutes: number) =>
      `Tu resumen · ${plural(topics, "tema", "temas")} · ${minutes} min de lectura`,
    listen: "Escuchar el resumen de hoy",
    audio: "Audio",
    minutes: (n: number) => `${n} min`,
    aiNarration: "Narrado por IA",
    preparing: "Preparando tu podcast…",
    onItsWay: "La versión en audio está en camino",
    retryPodcast: "Reintentar el podcast",
    makePodcast: "Crear el podcast de hoy",
    podcastBlurb: "Una versión en audio, en formato conversación · tarda un par de minutos",
    forYou: "Para ti",
    newTopic: "Tema nuevo",
    sources: (n: number) => plural(n, "fuente", "fuentes"),
    emptyTitle: "Todo listo",
    emptyAtBefore: "Tu primer resumen llegará mañana a las ",
    emptyMorning: "Tu primer resumen llegará mañana por la mañana",
    emptyAfter: ". ¿Quieres verlo ya?",
    generate: "Crear el resumen de hoy",
    takes: "Tarda unos 3–4 minutos.",
    compilingTitle: "Preparando tu resumen…",
    compilingBody:
      "Reuniendo las noticias de hoy y redactándolas. Suele tardar unos 3–4 minutos y aparecerá aquí sola. Puedes salir de esta pantalla; estará aquí cuando vuelvas.",
    compilingAria: "Preparando",
    errorTitle: "No ha llegado",
    errorFallback: "Tu resumen no terminó de prepararse; puede que se atascara. Vuelve a intentarlo.",
    tips: {
      briefTitle: "Este es tu resumen",
      briefBody:
        "Cada tarjeta es un tema que elegiste, redactado a partir de las noticias de hoy. Toca una para leerla entera.",
      recapTitle: "Mientras no estabas",
      recapBody: "Si has estado fuera, tu resumen empieza poniéndote al día de lo que te perdiste.",
      podcastTitle: "Escúchalo, no solo lo leas",
      podcastBody: "Tu resumen como una conversación: toca para reproducir, o ábrelo para ver capítulos y velocidad.",
    },
  },

  recap: {
    title: "Mientras no estabas",
    days: (n: number) => plural(n, "día", "días"),
    less: "Ver menos",
    more: "Leer más",
  },

  report: {
    back: "Atrás",
    textSize: "Tamaño del texto",
    share: "Compartir",
    notFound: "No hemos encontrado ese resumen.",
    notReady: "Este resumen aún no está listo.",
    title: "Tu resumen",
    topics: (n: number) => plural(n, "tema", "temas"),
    sources: (n: number) => `Fuentes · ${n}`,
  },

  prefs: {
    title: "Ajustes",
    loading: "Cargando tus ajustes…",
    saving: "Guardando…",
    saved: "Guardado",
    saveError: "No se ha podido guardar",
    topicsLabel: "Tus temas",
    topicsBlurb: "Cada uno es una sección de tu resumen. Arrastra para reordenar, toca para editar o añade los tuyos.",
    demoNote: "Prueba lo que quieras: estás en la demo y los cambios no se guardan.",
    deliveryTitle: "Hora de entrega",
    deliveryBlurb: "Cuándo llega tu resumen cada día, en tu hora local",
    podcastTitle: "Podcast diario",
    podcastBlurb: "Una versión en audio de tu resumen, en formato conversación",
    languageTitle: "Idioma",
    languageBlurb: "Para la app ya, y para tus resúmenes desde el próximo",
    appearanceTitle: "Apariencia",
    followingDevice: "Igual que tu dispositivo",
    alwaysLight: "Siempre claro",
    alwaysDark: "Siempre oscuro",
    themeAuto: "Auto",
    themeLight: "Claro",
    themeDark: "Oscuro",
    replayTitle: "Ver cómo se configuró",
    replayBlurb: "Repite el asistente de configuración",
    regenDone: "Rehaciendo el resumen de hoy: aparecerá en Hoy en un par de minutos.",
    regenTitle: "Has cambiado tus temas",
    regenBody:
      "El resumen de hoy usó tus temas anteriores. Rehazlo ahora, o los cambios se aplicarán desde mañana.",
    regenStarting: "Empezando…",
    regenNow: "Rehacer el de hoy",
    regenWait: "Esperar a mañana",
    tips: {
      topicsTitle: "Tus temas",
      topicsBody: (max: number) =>
        `Son las secciones de tu resumen. Arrastra para reordenar, toca para editar o añade hasta ${max}.`,
      deliveryTitle: "Hora de entrega",
      deliveryBody: "Elige cuándo llega tu resumen cada mañana, en tu hora local.",
      podcastTitle: "Podcast diario",
      podcastBody: "Activa la versión en audio y aparecerá en Hoy, lista para escuchar.",
    },
  },

  history: {
    title: "Historial",
    weekdays: ["L", "M", "X", "J", "V", "S", "D"],
    prevMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    tapDate: "Toca una fecha para abrir su resumen",
    recent: "Resúmenes recientes",
    saved: (n: number) => `${n} guardados`,
    empty: "Aquí aparecerán tus resúmenes anteriores.",
    topics: (n: number) => plural(n, "tema", "temas"),
    read: "Leído",
    tips: {
      calendarTitle: "Se guardan todos",
      calendarBody:
        "Los días destacados tienen resumen: toca uno para volver a abrirlo. Usa las flechas para ver meses anteriores.",
      listTitle: "Abre el resumen de cualquier día",
      listBody:
        "Toca una tarjeta para leer el resumen de ese día. Una barra de color marca los no leídos; el icono de auriculares, los que tienen podcast.",
    },
  },

  profile: {
    title: "Perfil",
    signedIn: "Sesión iniciada",
    account: "Cuenta de Daily",
    signOut: "Cerrar sesión",
    footnote: "Aquí vivirán la hora de entrega, las notificaciones y la apariencia.",
  },

  player: {
    title: "Tu resumen diario",
    cover: "Resumen diario",
    nowPlaying: "Reproduciendo",
    meta: (minutes: number) => `Narrado por IA · ${minutes} min`,
    expand: "Abrir el reproductor",
    collapse: "Cerrar el reproductor",
    play: "Reproducir",
    pause: "Pausa",
    back15: "Retroceder 15 segundos",
    forward15: "Avanzar 15 segundos",
  },

  coach: { skip: "Saltar", next: "Siguiente", done: "Entendido" },

  demo: { banner: "Demo · resúmenes de muestra, crear nuevos está desactivado" },

  delivery: { aria: "Hora de entrega" },
};

export const STRINGS = { en, es } as const;
