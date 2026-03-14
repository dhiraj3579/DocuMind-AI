# DocuMind AI 🧠📄

DocuMind AI is an intelligent document assistant that turns your static PDFs and text files into an interactive, searchable knowledge base. Using **Retrieval-Augmented Generation (RAG)** and the **Google Gemini API**, it allows you to "chat" with your documents to extract insights, summarize content, and find specific information instantly.

## 🚀 Features

- **Multi-Format Support:** Upload PDFs and `.txt` files.
- **Semantic Search:** Uses `gemini-embedding-2-preview` to understand the *meaning* of your documents, not just keywords.
- **Intelligent Chat:** Powered by `gemini-3-flash-preview` for fast, accurate, and context-aware responses.
- **Source Attribution:** The assistant tells you exactly which document it used to find the answer.
- **Modern UI:** A clean, responsive interface built with React, Tailwind CSS, and Framer Motion.

## 🛠️ Tech Stack

- **Frontend:** React, Tailwind CSS, Lucide Icons, Framer Motion.
- **Backend:** Node.js (Express), Vite.
- **AI/ML:** Google Gemini API (`@google/genai`).
- **Processing:** PDF-parse for document extraction.

## 🏁 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Google Gemini API Key (Get one at [aistudio.google.com](https://aistudio.google.com))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/documind-ai.git
   cd documind-ai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment variables:
   Create a `.env` file in the root directory and add your API key:
   ```env
   CUSTOM_GEMINI_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## 📖 How to Use

1. **Upload:** Click the "Upload" button in the sidebar to add your PDFs or text files.
2. **Process:** The app will automatically chunk and embed your documents.
3. **Chat:** Start asking questions in the chat box! For example:
   - *"Summarize the main points of this document."*
   - *"What are the key deadlines mentioned?"*
   - *"What are the top 5 skills in this resume?"*

## 🛡️ License

This project is licensed under the MIT License.
