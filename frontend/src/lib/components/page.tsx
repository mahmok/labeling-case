import type { JSX, ReactNode } from "react";

export type PageProps = {
  children: ReactNode;
  label: string;
  description: string;
};

export const Page = ({ children, label, description }: PageProps): JSX.Element => (
  <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-primary">{label}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-base-content/65">{description}</p>
    </div>

    <section className="card card-border bg-base-100 shadow-sm">
      <div className="card-body flex-row items-start gap-4 p-6 sm:p-8">{children}</div>
    </section>
  </div>
);
