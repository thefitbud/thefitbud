declare module "*.png" {
  const source: number;
  export default source;
}

declare module "*.jpg" {
  const source: number;
  export default source;
}

declare module "*.jpeg" {
  const source: number;
  export default source;
}

declare module "*.svg" {
  import type { ReactElement, SVGProps } from "react";
  const ReactComponent: (props: SVGProps<SVGSVGElement>) => ReactElement;
  export default ReactComponent;
}
