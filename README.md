# BetterIndex - Multi-LLM Chat Application

**Description:** Chat with multiple AI models in one simple interface.

## Features

### 🤖 Multi-LLM Support

- **Multiple AI Models**: Support for various Large Language Models
- **Model Switching**: Easily switch between different LLMs mid-conversation
- **Unified Interface**: Single chat interface for all supported models

### 🗨️ Chat Interface

- Real-time conversations with multiple LLMs
- Clean, modern UI with dark/light mode support
- Responsive design for desktop and mobile

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
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

Edit `.env.local` with the following required environment variables:

```env
GOOGLE_CLIENT_ID=                       # Google OAuth client ID for authentication
GOOGLE_CLIENT_SECRET=                   # Google OAuth client secret
BETTER_AUTH_SECRET=                     # Secret key for BetterAuth
DATABASE_URL=                           # Database connection URL
BETTER_AUTH_URL=http://localhost:3000   # Base URL for authentication (update for production)
TAVILY_API_KEY=                         # Tavily API key for web search functionality
UPSTASH_REDIS_REST_URL=                 # Upstash Redis REST URL for caching
UPSTASH_REDIS_REST_TOKEN=               # Upstash Redis REST token
UPLOADTHING_TOKEN=                      # Upload thing Token
OPENAI_API_KEY=                         # Open AI API key
OPENROUTER_API_KEY=                     # Open Router API Key
```

#### Getting Google OAuth Credentials

To obtain your Google OAuth credentials:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Configure the OAuth consent screen if prompted
6. Choose **Web application** as the application type
7. Add authorized redirect URIs:
   - For development: `http://localhost:3000/api/auth/callback/google`
   - For production: `https://your-domain.com/api/auth/callback/google`
8. Copy the **Client ID** and **Client Secret** to your `.env.local` file

9. Run the development server:

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

## Technologies Used

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with shadcn UI
- **Icons**: Lucide React
- **Auth**: Better Auth
- **ORM**: Drizzle
- **Database**: Postgres (NeonDB)
- **SDK**: OpenAI SDK
- **Storage Bucket**: Uploadthing
- **State Management**: Zustand
- **RateLimiter**: Upstash Redis
- **Syntax highlighter**: React Syntax Highlighter
- **Hosting**: Vercel
- **React Compiler**: babel-plugin-react-compiler ^19
- **Virtual List**: Tanstack React Virtual
- **Web Search**: Tavily API
- **LLM Provider**: Openrouter/OpenAI

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request
