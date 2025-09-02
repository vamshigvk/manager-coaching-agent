import { Conversation } from './components/conversation';

export default function Home() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-semibold mb-6 text-center">Chat</h1>
        <Conversation />
      </div>
    </main>
  );
}
