# BetterIndex - Multi-LLM Chat Application

**Description:** A unified chat interface for multiple Large Language Models. Switch between different AI models seamlessly and compare responses across various LLMs in one application.

## Features

### 🤖 Multi-LLM Support

- **Multiple AI Models**: Support for various Large Language Models
- **Model Switching**: Easily switch between different LLMs mid-conversation
- **Unified Interface**: Single chat interface for all supported models
- **Model Comparison**: Compare responses from different LLMs

### 🗨️ Chat Interface

- Real-time conversations with multiple LLMs
- Clean, modern UI with dark/light mode support
- Responsive design for desktop and mobile

### 📚 Chat History Management

- **Smart Caching**: Local storage-based chat history with automatic sync
- **Intuitive Navigation**:
  - Single tap to open chats
  - Long press for edit/delete options
- **Search & Filter**: Real-time search through chat history
- **Pagination**: Efficient browsing of large chat collections
- **Edit Chat Titles**: Rename conversations on the fly
- **Delete Chats**: Remove unwanted conversations

### 🎨 User Experience

- **Floating Actions**: Edit/delete buttons appear as overlay without changing tile size
- **Haptic Feedback**: Mobile vibration on long press
- **Auto-dismiss**: Options automatically hide after 5 seconds
- **Visual Feedback**: Loading states and smooth transitions

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd BI\ -\ App
```

2. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys and configuration.

4. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── components/
│   ├── ChatHistory.tsx     # Chat history sidebar with search & pagination
│   ├── ui/                 # Reusable UI components
│   └── ...
├── lib/                    # Utility functions and API calls
├── app/                    # Next.js app directory
└── ...
```

## Key Components

### ChatHistory Component

- Manages local chat cache and pagination
- Provides search functionality across chat titles
- Handles CRUD operations (create, read, update, delete)
- Implements touch gestures for mobile interaction

### Multi-LLM Chat Interface

- Real-time messaging with multiple Large Language Models
- Model selection and switching capabilities
- Message history persistence across different models
- Responsive design with modern UI patterns

## Technologies Used

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with Radix UI primitives
- **Icons**: Lucide React
- **Storage**: LocalStorage with event-driven sync

## API Endpoints

- `GET/POST /api/chat` - Chat operations
- `DELETE /api/chat/[id]` - Delete specific chat
- `PATCH /api/chat/[id]` - Update chat title

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request
