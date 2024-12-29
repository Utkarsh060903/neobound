const mongoose = require("mongoose");
const Document = require("./Document.js");
const dotenv = require("dotenv")

dotenv.config()

mongoose.connect(
  process.env.MONGO_URI,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

const io = require("socket.io")(3001, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const defaultValue = "";

io.on("connection", (socket) => {
  console.log("User connected");

  let activeUsers = 0;

  socket.on("get-document", async (documentId) => {
    const document = await findOrCreateDocument(documentId);
    socket.join(documentId);
    activeUsers = io.sockets.adapter.rooms.get(documentId)?.size || 0;

    io.to(documentId).emit("update-active-users", activeUsers);

    socket.emit("load-document", document.data);

    socket.on("send-changes", (delta) => {
      socket.broadcast.to(documentId).emit("receive-changes", delta);
    });

    socket.on("send-cursor", (cursorData) => {
      socket.broadcast.to(documentId).emit("update-cursor", {
        socketId: socket.id,
        ...cursorData,
      });
    });

    socket.on("save-document", async (data) => {
      await Document.findByIdAndUpdate(documentId, { data });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
      activeUsers = io.sockets.adapter.rooms.get(documentId)?.size || 0;
      io.to(documentId).emit("update-active-users", activeUsers);
    });
  });
});

async function findOrCreateDocument(id) {
  if (id == null) return;

  const document = await Document.findById(id);
  if (document) return document;
  return await Document.create({ _id: id, data: defaultValue });
}
