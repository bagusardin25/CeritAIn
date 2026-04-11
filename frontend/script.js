// Elemen DOM
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

// Menyimpan riwayat percakapan untuk memberi konteks pada AI
let chatHistory = [];

/**
 * Auto-resize textarea agar membesar sesuai teks yang diketik
 */
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = (this.scrollHeight) + "px";
  
  if (this.scrollHeight > 150) {
    this.style.overflowY = "auto";
  } else {
    this.style.overflowY = "hidden";
  }
});

/**
 * Handle shortcut keyboard: 
 * - Enter = Kirim pesan
 * - Shift + Enter = Baris baru
 */
userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

/**
 * Fungsi utama untuk mengirim pesan (STREAMING VERSION)
 */
async function sendMessage() {
  const text = userInput.value.trim();
  
  if (!text) return;

  // 1. Tampilkan pesan user ke UI
  appendMessage("user", text);
  
  // Reset input
  userInput.value = "";
  userInput.style.height = "auto";
  
  // Simpan ke riwayat
  chatHistory.push({ role: "user", content: text });

  // 2. Tampilkan efek "Mengetik..."
  const typingId = showTypingIndicator();
  
  // Disable tombol & input agar user tidak spam
  sendBtn.disabled = true;
  userInput.disabled = true;

  try {
    // 3. Panggil API dengan mode streaming
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: chatHistory
      })
    });

    // Cek apakah respons berupa error JSON (bukan stream)
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      removeTypingIndicator(typingId);
      throw new Error(data.error || "Gagal memanggil API");
    }

    // 4. Hapus typing indicator & buat bubble kosong untuk AI
    removeTypingIndicator(typingId);
    const aiBubble = createEmptyAiBubble();

    // 5. Baca stream kata per kata & tampilkan secara real-time
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode potongan data SSE dari server
      const chunk = decoder.decode(value, { stream: true });
      
      // Setiap potongan berformat "data: {...}\n\n"
      // Kita perlu parse satu per satu
      const lines = chunk.split("\n");
      
      for (const line of lines) {
        // Lewati baris kosong
        if (!line.startsWith("data: ")) continue;
        
        // Ambil bagian JSON setelah "data: "
        const jsonStr = line.substring(6).trim();
        
        // "[DONE]" menandakan akhir dari stream
        if (jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const token = parsed.choices?.[0]?.delta?.content;
          
          if (token) {
            fullText += token;
            // Update isi bubble secara real-time!
            aiBubble.innerHTML = fullText.replace(/\n/g, "<br>");
            scrollToBottom();
          }
        } catch (e) {
          // Beberapa chunk mungkin terpotong, abaikan saja
        }
      }
    }

    // 6. Simpan balasan lengkap ke riwayat
    chatHistory.push({ role: "assistant", content: fullText });

  } catch (error) {
    console.error("Error:", error);
    removeTypingIndicator(typingId);
    appendMessage("ai", "Maaf ya, sistemku sedang mengalami sedikit kendala 😥 Coba lagi nanti ya.");
  } finally {
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

/**
 * Membuat bubble chat AI kosong yang siap diisi secara streaming
 */
function createEmptyAiBubble() {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", "ai");
  
  const bubbleDiv = document.createElement("div");
  bubbleDiv.classList.add("bubble");
  
  messageDiv.appendChild(bubbleDiv);
  chatBox.appendChild(messageDiv);
  scrollToBottom();
  
  return bubbleDiv; // Mengembalikan elemen bubble agar bisa di-update isinya
}

/**
 * Fungsi pembantu untuk membuat balon chat (HTML)
 */
function appendMessage(sender, text) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender);
  
  const bubbleDiv = document.createElement("div");
  bubbleDiv.classList.add("bubble");
  
  bubbleDiv.innerHTML = text.replace(/\n/g, '<br>');
  
  messageDiv.appendChild(bubbleDiv);
  chatBox.appendChild(messageDiv);
  
  scrollToBottom();
}

/**
 * Fungsi efek animasi "CeritAIn sedang mengetik..."
 */
function showTypingIndicator() {
  const messageDiv = document.createElement("div");
  const uniqueId = "typing-" + Date.now();
  messageDiv.id = uniqueId;
  messageDiv.classList.add("message", "ai");
  
  const bubbleDiv = document.createElement("div");
  bubbleDiv.classList.add("bubble", "typing-indicator");
  
  bubbleDiv.innerHTML = `
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  `;
  
  messageDiv.appendChild(bubbleDiv);
  chatBox.appendChild(messageDiv);
  scrollToBottom();
  
  return uniqueId;
}

function removeTypingIndicator(id) {
  const element = document.getElementById(id);
  if (element) {
    element.remove();
  }
}

function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}
