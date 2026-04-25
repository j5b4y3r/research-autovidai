const url = "https://cdn.pixabay.com/download/audio/2026/04/03/audio_87d6ca8b40.mp3?filename=ksjsbwuil-cash-register-1-513922.mp3";
fetch(url).then(r => console.log(Object.fromEntries(r.headers.entries()))).catch(e => console.error(e));
