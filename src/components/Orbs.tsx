/**
 * Fixed background layer of soft, slowly drifting gradient orbs.
 * Purely decorative — sits under all content (z-0) and ignores pointer events.
 */
export function Orbs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full bg-gradient-to-br from-saffron/40 to-coral/30 blur-3xl animate-float-slow" />
      <div className="absolute top-1/3 -right-48 h-[38rem] w-[38rem] rounded-full bg-gradient-to-bl from-jade/30 to-teal/25 blur-3xl animate-float-slower" />
      <div className="absolute bottom-[-12rem] left-1/4 h-[30rem] w-[30rem] rounded-full bg-gradient-to-tr from-lotus/25 to-saffron/20 blur-3xl animate-float-slow" />
      <div className="absolute top-2/3 left-[-10rem] h-[24rem] w-[24rem] rounded-full bg-gradient-to-r from-coral/20 to-lotus/20 blur-3xl animate-float-slower" />
    </div>
  );
}
