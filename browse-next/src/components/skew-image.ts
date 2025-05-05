// Adapted from https://codepen.io/MNK/pen/dZqGvd
const render = (
  context: CanvasRenderingContext2D,
  wireframe: boolean,
  image: ImageBitmap,
  tri: Triangle,
) => {
  if (wireframe) {
    context.strokeStyle = "black";
    context.beginPath();
    context.moveTo(tri.p0.x, tri.p0.y);
    context.lineTo(tri.p1.x, tri.p1.y);
    context.lineTo(tri.p2.x, tri.p2.y);
    context.lineTo(tri.p0.x, tri.p0.y);
    context.stroke();
    context.closePath();
  }

  if (image) {
    drawTriangle(
      context,
      image,
      tri.p0.x,
      tri.p0.y,
      tri.p1.x,
      tri.p1.y,
      tri.p2.x,
      tri.p2.y,
      tri.t0.u,
      tri.t0.v,
      tri.t1.u,
      tri.t1.v,
      tri.t2.u,
      tri.t2.v,
    );
  }
};
export const drawSkewedImage = (
  ctx: CanvasRenderingContext2D,
  controls: HTMLDivElement[],
  image: ImageBitmap,
) => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const canvasOnScreenWidth = ctx.canvas.getBoundingClientRect().width;
  const ratio = ctx.canvas.width / canvasOnScreenWidth;
  const triangles = calculateGeometry(
    controls,
    image.width / ratio,
    image.height / ratio,
  );
  for (const triangle of triangles) {
    render(ctx, false, image, triangle);
  }
};

class Point {
  constructor(
    public x: number = 0,
    public y: number = 0,
  ) {}

  length(point: Point = new Point()) {
    let xs = 0;
    let ys = 0;
    xs = point.x - this.x;
    xs = xs * xs;
    ys = point.y - this.y;
    ys = ys * ys;
    return Math.sqrt(xs + ys);
  }
}

class TextCoord {
  constructor(
    public u: number,
    public v: number,
  ) {}
}

class Triangle {
  constructor(
    public p0: Point,
    public p1: Point,
    public p2: Point,
    public t0: TextCoord,
    public t1: TextCoord,
    public t2: TextCoord,
  ) {}
}
const calculateGeometry = (
  controls: HTMLDivElement[],
  imgW: number,
  imgH: number,
): Triangle[] => {
  // clear triangles out
  const triangles = [];

  // generate subdivision
  const subs = 7; // vertical subdivisions
  const divs = 7; // horizontal subdivisions
  const { left: parentX, top: parentY } = (
    controls[0].parentElement as HTMLDivElement
  ).getBoundingClientRect();
  const bounds = controls.map((c) => c.getBoundingClientRect());
  const points = bounds.map(
    (b) =>
      new Point(b.left + b.width / 2 - parentX, b.top + b.height / 2 - parentY),
  );
  const p1 = points[0];
  const p2 = points[1];
  const p3 = points[2];
  const p4 = points[3];

  const dx1 = p4.x - p1.x;
  const dy1 = p4.y - p1.y;
  const dx2 = p3.x - p2.x;
  const dy2 = p3.y - p2.y;

  for (let sub = 0; sub < subs; ++sub) {
    const curRow = sub / subs;
    const nextRow = (sub + 1) / subs;

    const curRowX1 = p1.x + dx1 * curRow;
    const curRowY1 = p1.y + dy1 * curRow;

    const curRowX2 = p2.x + dx2 * curRow;
    const curRowY2 = p2.y + dy2 * curRow;

    const nextRowX1 = p1.x + dx1 * nextRow;
    const nextRowY1 = p1.y + dy1 * nextRow;

    const nextRowX2 = p2.x + dx2 * nextRow;
    const nextRowY2 = p2.y + dy2 * nextRow;

    for (let div = 0; div < divs; ++div) {
      const curCol = div / divs;
      const nextCol = (div + 1) / divs;

      const dCurX = curRowX2 - curRowX1;
      const dCurY = curRowY2 - curRowY1;
      const dNextX = nextRowX2 - nextRowX1;
      const dNextY = nextRowY2 - nextRowY1;

      const p1x = curRowX1 + dCurX * curCol;
      const p1y = curRowY1 + dCurY * curCol;

      const p2x = curRowX1 + (curRowX2 - curRowX1) * nextCol;
      const p2y = curRowY1 + (curRowY2 - curRowY1) * nextCol;

      const p3x = nextRowX1 + dNextX * nextCol;
      const p3y = nextRowY1 + dNextY * nextCol;

      const p4x = nextRowX1 + dNextX * curCol;
      const p4y = nextRowY1 + dNextY * curCol;

      const u1 = curCol * imgW;
      const u2 = nextCol * imgW;
      const v1 = curRow * imgH;
      const v2 = nextRow * imgH;

      const triangle1 = new Triangle(
        new Point(p1x, p1y),
        new Point(p3x, p3y),
        new Point(p4x, p4y),
        new TextCoord(u1, v1),
        new TextCoord(u2, v2),
        new TextCoord(u1, v2),
      );

      const triangle2 = new Triangle(
        new Point(p1x, p1y),
        new Point(p2x, p2y),
        new Point(p3x, p3y),
        new TextCoord(u1, v1),
        new TextCoord(u2, v1),
        new TextCoord(u2, v2),
      );

      triangles.push(triangle1);
      triangles.push(triangle2);
    }
  }
  return triangles;
};

// from http://tulrich.com/geekstuff/canvas/jsgl.js
const drawTriangle = (
  ctx: CanvasRenderingContext2D,
  im: ImageBitmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
) => {
  const canvasOnScreenWidth = ctx.canvas.getBoundingClientRect().width;
  const ratio = ctx.canvas.width / canvasOnScreenWidth;
  x0 *= ratio;
  y0 *= ratio;
  x1 *= ratio;
  y1 *= ratio;
  x2 *= ratio;
  y2 *= ratio;
  sx0 *= ratio;
  sy0 *= ratio;
  sx1 *= ratio;
  sy1 *= ratio;
  sx2 *= ratio;
  sy2 *= ratio;
  ctx.save();
  // TODO: Dilate the triangle slightly to remove visible seams
  // Get the centroid of the triangle.
  // Get each edge of the triangle, and perp it out 0.5 px or something.

  // Clip the output to the on-screen triangle boundaries.
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  /*
    ctx.transform(m11, m12, m21, m22, dx, dy) sets the context transform matrix.

    The context matrix is:

    [ m11 m21 dx ]
    [ m12 m22 dy ]
    [  0   0   1 ]

    Coords are column vectors with a 1 in the z coord, so the transform is:
    x_out = m11 * x + m21 * y + dx;
    y_out = m12 * x + m22 * y + dy;

    From Maxima, these are the transform values that map the source
    coords to the dest coords:

    sy0 (x2 - x1) - sy1 x2 + sy2 x1 + (sy1 - sy2) x0
    [m11 = - -----------------------------------------------------,
    sx0 (sy2 - sy1) - sx1 sy2 + sx2 sy1 + (sx1 - sx2) sy0

    sy1 y2 + sy0 (y1 - y2) - sy2 y1 + (sy2 - sy1) y0
    m12 = -----------------------------------------------------,
    sx0 (sy2 - sy1) - sx1 sy2 + sx2 sy1 + (sx1 - sx2) sy0

    sx0 (x2 - x1) - sx1 x2 + sx2 x1 + (sx1 - sx2) x0
    m21 = -----------------------------------------------------,
    sx0 (sy2 - sy1) - sx1 sy2 + sx2 sy1 + (sx1 - sx2) sy0

    sx1 y2 + sx0 (y1 - y2) - sx2 y1 + (sx2 - sx1) y0
    m22 = - -----------------------------------------------------,
    sx0 (sy2 - sy1) - sx1 sy2 + sx2 sy1 + (sx1 - sx2) sy0

    sx0 (sy2 x1 - sy1 x2) + sy0 (sx1 x2 - sx2 x1) + (sx2 sy1 - sx1 sy2) x0
    dx = ----------------------------------------------------------------------,
    sx0 (sy2 - sy1) - sx1 sy2 + sx2 sy1 + (sx1 - sx2) sy0

    sx0 (sy2 y1 - sy1 y2) + sy0 (sx1 y2 - sx2 y1) + (sx2 sy1 - sx1 sy2) y0
    dy = ----------------------------------------------------------------------]
    sx0 (sy2 - sy1) - sx1 sy2 + sx2 sy1 + (sx1 - sx2) sy0
  */

  const denom = sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0;
  if (denom == 0) {
    return;
  }
  const m11 =
    -(sy0 * (x2 - x1) - sy1 * x2 + sy2 * x1 + (sy1 - sy2) * x0) / denom;
  const m12 =
    (sy1 * y2 + sy0 * (y1 - y2) - sy2 * y1 + (sy2 - sy1) * y0) / denom;
  const m21 =
    (sx0 * (x2 - x1) - sx1 * x2 + sx2 * x1 + (sx1 - sx2) * x0) / denom;
  const m22 =
    -(sx1 * y2 + sx0 * (y1 - y2) - sx2 * y1 + (sx2 - sx1) * y0) / denom;
  const dx =
    (sx0 * (sy2 * x1 - sy1 * x2) +
      sy0 * (sx1 * x2 - sx2 * x1) +
      (sx2 * sy1 - sx1 * sy2) * x0) /
    denom;
  const dy =
    (sx0 * (sy2 * y1 - sy1 * y2) +
      sy0 * (sx1 * y2 - sx2 * y1) +
      (sx2 * sy1 - sx1 * sy2) * y0) /
    denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  // Draw the whole image.  Transform and clip will map it onto the
  // correct output triangle.
  ctx.drawImage(im, 0, 0);
  ctx.restore();
};
