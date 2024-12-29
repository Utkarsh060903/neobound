import { useCallback, useEffect, useState } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { io } from "socket.io-client";
import { useParams } from "react-router-dom";

const SAVE_INTERVAL_MS = 2000;
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ font: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["bold", "italic", "underline"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ align: [] }],
  ["image", "blockquote", "code-block"],
  ["clean"],
];

const UserCursor = ({ username, position }) => {
  if (!position) return null;
  return (
    <div className="cursor" style={{
      position: 'absolute',
      left: position.left,
      top: position.top,
      transform: 'translateY(-100%)',
      transition: 'all 0.1s ease',
      backgroundColor: 'red',
      opacity: 0.5,
      zIndex: 10,
      pointerEvents: 'none'
    }}>
      <div style={{ width: '2px', height: '20px' }} />
      <div style={{ backgroundColor: 'red', color: 'white', padding: '2px 4px', borderRadius: '3px', fontSize: '12px' }}>
        {username}
      </div>
    </div>
  );
};

export default function TextEditor() {
  const { id: documentId } = useParams();
  const [socket, setSocket] = useState();
  const [quill, setQuill] = useState();
  const [activeUsers, setActiveUsers] = useState(0);
  const [cursors, setCursors] = useState({});
  const [username] = useState(`User ${Math.floor(Math.random() * 10000)}`);

  useEffect(() => {
    const s = io("http://localhost:3001");
    setSocket(s);
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (socket == null || quill == null) return;

    socket.once("load-document", document => {
      quill.setContents(document);
      quill.enable();
    });

    socket.on("update-active-users", count => {
      setActiveUsers(count);
    });

    socket.on("update-cursor", ({ socketId, range, username }) => {
      if (socketId === socket.id) return;
      if (range) {
        const bounds = quill.getBounds(range.index);
        setCursors(prev => ({
          ...prev,
          [socketId]: { username, position: bounds }
        }));
      } else {
        setCursors(prev => {
          const newCursors = { ...prev };
          delete newCursors[socketId];
          return newCursors;
        });
      }
    });

    socket.on("user-disconnected", socketId => {
      setCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[socketId];
        return newCursors;
      });
    });

    socket.emit("get-document", documentId);
  }, [socket, quill, documentId]);

  useEffect(() => {
    if (socket == null || quill == null) return;
    const interval = setInterval(() => {
      socket.emit("save-document", quill.getContents());
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [socket, quill]);

  useEffect(() => {
    if (socket == null || quill == null) return;
    const handler = delta => {
      quill.updateContents(delta);
    };
    socket.on("receive-changes", handler);
    return () => socket.off("receive-changes", handler);
  }, [socket, quill]);

  useEffect(() => {
    if (socket == null || quill == null) return;

    const handler = (delta, oldDelta, source) => {
      if (source !== "user") return;
      socket.emit("send-changes", delta);
    };

    const cursorHandler = (range) => {
      socket.emit("send-cursor", { range, username });
    };

    quill.on("text-change", handler);
    quill.on("selection-change", cursorHandler);

    return () => {
      quill.off("text-change", handler);
      quill.off("selection-change", cursorHandler);
    };
  }, [socket, quill, username]);

  const wrapperRef = useCallback(wrapper => {
    if (wrapper == null) return;
    wrapper.innerHTML = "";
    const editor = document.createElement("div");
    wrapper.append(editor);
    const q = new Quill(editor, {
      theme: "snow",
      modules: { toolbar: TOOLBAR_OPTIONS },
    });
    q.disable();
    q.setText("Loading...");
    setQuill(q);
  }, []);

  return (
    <div className="container">
      <div>{activeUsers} online</div>
      <div ref={wrapperRef} />
      {Object.entries(cursors).map(([socketId, cursor]) => (
        <UserCursor key={socketId} {...cursor} />
      ))}
    </div>
  );
}