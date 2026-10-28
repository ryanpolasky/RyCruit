export function updateFavicon(theme: "dark" | "light") {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = `/favicon-${theme}.svg`;
}
