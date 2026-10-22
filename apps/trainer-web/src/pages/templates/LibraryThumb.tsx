/** Photo-like library thumbnail (not a letter tile). Deterministic per name. */
export function libraryThumbStyle(name: string): {
  backgroundImage: string;
  backgroundSize: string;
} {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const hue2 = (hue + 40) % 360;
  const sat = 35 + (hash % 25);
  const light = 42 + (hash % 18);
  return {
    backgroundImage: [
      `radial-gradient(circle at 30% 25%, hsla(${hue2},70%,78%,0.9), transparent 55%)`,
      `linear-gradient(145deg, hsl(${hue},${sat}%,${light}%), hsl(${hue2},${sat + 10}%,${light - 12}%))`,
    ].join(", "),
    backgroundSize: "cover",
  };
}

export function LibraryThumb({
  name,
  kind = "exercise",
}: {
  name: string;
  kind?: "exercise" | "food";
}) {
  const style = libraryThumbStyle(`${kind}:${name}`);
  return (
    <span
      className="lib-thumb lib-thumb-photo"
      style={style}
      aria-hidden="true"
      title={name}
    />
  );
}
