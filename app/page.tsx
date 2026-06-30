export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Hei, Annette! 👋</h1>
      <p className="text-lg text-gray-600">Appen din fungerer.</p>
      <button className="rounded-xl bg-black px-6 py-3 text-white hover:bg-gray-800 transition">
        Klikk meg
      </button>
    </main>
  );
}
