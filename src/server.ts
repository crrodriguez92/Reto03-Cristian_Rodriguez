//importar biblioteca instalada

import express from "express"; 

const app = express(); // crea la aplicación web
const PORT = Number(process.env.PORT) || 3001; //define puerto donde entrará al servidor

app.use(express.json());

app.get("/health", (_req, res) => { //creación ruta para comprobar si el servicio está activo, y healt solo es comprobación inicial
  res.json({
    status: "ok",
    service: "reto-03",
  });
});

app.listen(PORT, () => { //inicia el servidor
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
