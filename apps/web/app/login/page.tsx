import { LoginForm } from "../../components/login-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">VK + Telegram + MAX</p>
        <h2 className="text-5xl font-semibold leading-tight">Один редактор для всех ваших площадок.</h2>
        <p className="max-w-xl text-base text-ink/75">
          Создавайте черновики, проверяйте результат по каналам и публикуйте сразу или по расписанию.
        </p>
      </div>

      <LoginForm nextPath={params.next} />
    </div>
  );
}
