import { Header } from '../components/Header';

export function ComingSoon({ title, step }: { title: string; step: number }) {
  return (
    <main className="screen">
      <Header title={title} />
      <div className="empty">
        <p>{title} tracking is coming in step {step} of the plan.</p>
      </div>
    </main>
  );
}
