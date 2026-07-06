export function Footer() {
  return (
    <footer className="flex items-center justify-center font-berkeley-mono text-xs fixed bottom-8 w-full">
      <span className="text-[#878787]">
        © {new Date().getFullYear()} Svela
      </span>
    </footer>
  );
}
