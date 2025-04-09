import type { ApiTrackPosition, ApiTrackResponse } from "@typedefs/api/track";

interface Point {
  x: number;
  y: number;
}
export interface Curve {
  startPoint: Point;
  endPoint: Point;
  controlPoints: [Point, Point];
}

export interface MotionPath {
  curve: Curve[];
  tangents: [Point, Point];
}

export const sub = (p1: Point, p2: Point): Point => {
  return {
    x: p1.x - p2.x,
    y: p1.y - p2.y,
  };
};

export const add = (p1: Point, p2: Point): Point => {
  return {
    x: p1.x + p2.x,
    y: p1.y + p2.y,
  };
};

const normalise = (p: Point): Point => {
  // Make a point vector of length 1
  const len = magnitude(p);
  return {
    x: p.x / len,
    y: p.y / len,
  };
};

const dot = (a: Point, b: Point): number => {
  return a.x * b.x + a.y * b.y;
};

export const perp = (p: Point): Point => {
  return { x: -p.y, y: p.x };
};

export const mul = (a: Point, mag: number): Point => {
  return {
    x: a.x * mag,
    y: a.y * mag,
  };
};

const magnitude = (pt: Point): number => {
  return Math.sqrt(dot(pt, pt));
};

const equal = (a: Point, b: Point): boolean => {
  return a.x === b.x && a.y == b.y;
};

const distance = (start: Point, end: Point): number => {
  const offset = sub(start, end);
  return magnitude(offset);
};

const startTangent = (points: Point[]): Point => {
  return normalise(sub(points[1], points[0]));
};
const endTangent = (points: Point[]): Point => {
  return normalise(sub(points[points.length - 2], points[points.length - 1]));
};

const fitLine = (p1: Point, p2: Point): Curve[] => {
  const direction = sub(p2, p1),
    cp1 = add(p1, mul(direction, 0.33)),
    cp2 = add(p1, mul(direction, 0.66));
  return [curveFromPoints(p1, cp1, cp2, p2)];
};

const chordsForPoints = (points: Point[]): number[] => {
  const distances = [];
  let totalDistance = 0;
  distances.push(totalDistance);
  for (let i = 1; i < points.length; i++) {
    totalDistance += distance(points[i - 1], points[i]);
    distances.push(totalDistance);
  }

  for (let i = 0; i < points.length; i++) {
    distances[i] /= totalDistance;
  }

  return distances;
};

const curveFromPoints = (a: Point, b: Point, c: Point, d: Point): Curve => {
  return {
    startPoint: a,
    controlPoints: [b, c],
    endPoint: d,
  };
};

const generateBezier = (
  points: Point[],
  chords: number[],
  startTangent: Point,
  endTangent: Point,
): Curve => {
  const a = chords.map((chord) => {
    const inverseChord = 1 - chord;
    const b1 = 3 * chord * (inverseChord * inverseChord);
    const b2 = 3 * chord * chord * inverseChord;
    return [mul(startTangent, b1), mul(endTangent, b2)];
  });

  const c = [
    [0, 0],
    [0, 0],
  ];
  const x = [0, 0];
  const lastPoint = points[points.length - 1];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    c[0][0] += point.x * point.x;
    c[0][1] += point.x * point.y;
    c[1][0] = c[0][1];
    c[1][1] += point.y * point.y;
    const chord = chords[i];
    const inverseChord = 1 - chord;
    const b0 = inverseChord * inverseChord * inverseChord;
    const b1 = 3 * chord * (inverseChord * inverseChord);
    const b2 = 3 * chord * chord * inverseChord;
    const b3 = chord * chord * chord;

    const tmp = sub(
      point,
      add(
        add(mul(points[0], b0), mul(points[0], b1)),
        add(mul(lastPoint, b2), mul(lastPoint, b3)),
      ),
    );
    x[0] += dot(a[i][0], tmp);
    x[1] += dot(a[i][1], tmp);
  }

  const detC0C1 = c[0][0] * c[1][1] - c[1][0] * c[0][1];
  const detC0X = c[0][0] * x[1] - c[1][0] * x[0];
  const detXC1 = x[0] * c[1][1] - x[1] * c[0][1];

  let alphaL;
  let alphaR;
  if (Math.abs(detC0C1) < 1.0e-4) {
    alphaL = 0.0;
  } else {
    alphaL = detXC1 / detC0C1;
  }

  if (Math.abs(detC0C1) < 1.0e-4) {
    alphaR = 0.0;
  } else {
    alphaR = detC0X / detC0C1;
  }

  const segLength = distance(points[0], lastPoint);
  const epsilon = 1.0e-6 * segLength;

  if (alphaL < epsilon || alphaR < epsilon) {
    // Much less accurate means of estimating a curve
    const dist = segLength / 3.0;
    return curveFromPoints(
      points[0],
      add(points[0], mul(startTangent, dist)),
      add(lastPoint, mul(endTangent, dist)),
      lastPoint,
    );
  } else {
    // The control points are positioned an alpha distance out along the tangent vectors
    return curveFromPoints(
      points[0],
      add(points[0], mul(startTangent, alphaL)),
      add(lastPoint, mul(endTangent, alphaR)),
      lastPoint,
    );
  }
};

const basis = (
  t: number,
  w1: Point,
  w2: Point,
  w3: Point,
  w4: Point,
): Point => {
  const tSquared = t * t;
  const tCubed = tSquared * t;

  const oneMinusT = 1.0 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const oneMinusTCubed = oneMinusTSquared * oneMinusT;

  return add(
    add(
      add(mul(w1, oneMinusTCubed), mul(w2, 3.0 * oneMinusTSquared * t)),
      mul(w3, 3.0 * oneMinusT * tSquared),
    ),
    mul(w4, tCubed),
  );
};

const pointAtPos = (curve: Curve, pos: number): Point => {
  return basis(
    pos,
    curve.startPoint,
    curve.controlPoints[0],
    curve.controlPoints[1],
    curve.endPoint,
  );
};

const maxErrorForCurve = (
  points: Point[],
  chords: number[],
  curve: Curve,
): { error: number; splitPos: number } => {
  const errors = points.map((point, index) => {
    const chord = chords[index];
    const actual = pointAtPos(curve, chord);
    const offset = sub(point, actual);
    return dot(offset, offset);
  });

  // Search the errors for the biggest one
  let biggestErrorSquared = 0.0;
  let biggestErrorOffset = 0;

  for (let i = 0; i < errors.length; i++) {
    const errorSquared = errors[i];
    if (errorSquared > biggestErrorSquared) {
      biggestErrorSquared = errorSquared;
      biggestErrorOffset = i;
    }
  }

  // Indicate the biggest error and where it was
  return {
    error: Math.sqrt(biggestErrorSquared),
    splitPos: biggestErrorOffset,
  };
};

const deCasteljau3 = (t: number, w1: Point, w2: Point, w3: Point): Point => {
  const wn1 = add(mul(w1, 1.0 - t), mul(w2, t));
  const wn2 = add(mul(w2, 1.0 - t), mul(w3, t));

  return deCasteljau2(t, wn1, wn2);
};

const deCasteljau2 = (t: number, w1: Point, w2: Point): Point => {
  return add(mul(w1, 1 - t), mul(w2, t));
};

const newtonRaphsonRootFind = (
  curve: Curve,
  point: Point,
  estimatedT: number,
): number => {
  const start = curve.startPoint;
  const end = curve.endPoint;
  const cp1 = curve.controlPoints[0];
  const cp2 = curve.controlPoints[1];
  const qt = pointAtPos(curve, estimatedT);

  const qn1 = mul(sub(cp1, start), 3);
  const qn2 = mul(sub(cp2, cp1), 3);
  const qn3 = mul(sub(end, cp2), 3);

  const qnn1 = mul(sub(qn2, qn1), 2);
  const qnn2 = mul(sub(qn3, qn2), 2);

  const qnt = deCasteljau3(estimatedT, qn1, qn2, qn3);
  const qnnt = deCasteljau2(estimatedT, qnn1, qnn2);

  const numerator = dot(sub(qt, point), qnt);
  const denominator = dot(qnt, qnt) + dot(sub(qt, point), qnnt);

  if (denominator === 0.0) {
    return estimatedT;
  } else {
    return estimatedT - numerator / denominator;
  }
};

const reparameterize = (
  points: Point[],
  chords: number[],
  curve: Curve,
): number[] => {
  return points.map((point, index) => {
    const chord = chords[index];
    return newtonRaphsonRootFind(curve, point, chord);
  });
};

const tangentBetween = (p1: Point, p2: Point, p3: Point): Point => {
  const v1 = sub(p1, p2);
  const v2 = sub(p2, p3);
  return normalise(mul(add(v1, v2), 0.5));
};

const fitCubicCurve = (
  points: Point[],
  startTangent: Point,
  endTangent: Point,
  maxError: number,
): Curve[] => {
  if (points.length == 2) {
    return fitLine(points[0], points[1]);
  } else {
    let chords = chordsForPoints(points);
    let curve = generateBezier(points, chords, startTangent, endTangent);
    let error;
    let splitPos;
    const err = maxErrorForCurve(points, chords, curve);
    error = err.error;
    splitPos = err.splitPos;

    if (error > maxError && error < maxError * 4.0) {
      for (let i = 0; i < 4; i++) {
        chords = reparameterize(points, chords, curve);
        curve = generateBezier(points, chords, startTangent, endTangent);

        const err = maxErrorForCurve(points, chords, curve);
        error = err.error;
        splitPos = err.splitPos;

        if (error <= maxError) {
          break;
        }
      }
    }
    if (error <= maxError) {
      return [curve];
    } else {
      // If error still too large, split the points and create two curves
      const centerTangent = tangentBetween(
        points[splitPos - 1],
        points[splitPos],
        points[splitPos + 1],
      );

      // Fit the two sides
      const lhs = fitCubicCurve(
        points.slice(0, splitPos + 1),
        startTangent,
        centerTangent,
        maxError,
      );
      const rhs = fitCubicCurve(
        points.slice(splitPos, points.length),
        mul(centerTangent, -1.0),
        endTangent,
        maxError,
      );

      return [...lhs, ...rhs];
    }
  }
};

export const fitCurve = (points: Point[]): Curve[] => {
  const maxPointsToFit = 100;
  if (points.length < 2) {
    // We can't do curve fitting
    return [];
  } else {
    const curves = [];
    const numBlocks = (points.length - 1) / maxPointsToFit + 1;
    for (let pointBlock = 0; pointBlock < numBlocks; pointBlock++) {
      const startPoint = pointBlock * maxPointsToFit;
      let numPoints = maxPointsToFit;

      if (startPoint + numPoints > points.length) {
        numPoints = points.length - startPoint;
      }

      if (numPoints < 2) {
        continue;
      }

      const blockPoints = points.slice(startPoint, startPoint + numPoints);
      const startTangentA = startTangent(blockPoints);
      const endTangentA = endTangent(blockPoints);
      const fit = fitCubicCurve(blockPoints, startTangentA, endTangentA, 5.75);
      for (const curve of fit) {
        curves.push(curve);
      }
    }
    return curves;
  }
};

// Smooth jitter out of points
export const smoothLine = (points: Point[]): Point[] => {
  // Idea, what about smoothing only with prior knowledge, so we don't use future points?
  // Idea: map pts to *time*, i.e distance along curve, and then smooth each dimension separately.
  // Idea, should the weight contribution depend on differences in time?
  let prev = points[0];
  // Should we smooth the end points, or just the points in between?
  for (let i = 1; i < points.length - 1; i++) {
    // Should just need to store n - 1 original points.
    const slice: [Point, number][] = [
      [prev, 0.25],
      [points[i], 0.5],
      [points[i + 1], 0.25],
    ];
    prev = points[i];
    points[i] = slice.reduce(
      (acc: Point, [pt, w]: [Point, number]): Point => {
        acc.x += pt.x * w;
        acc.y += pt.y * w;
        return acc;
      },
      { x: 0, y: 0 },
    );
  }
  return points;
};

export const pointsForTrack = ({ positions }: ApiTrackResponse): Point[] => {
  return (positions as ApiTrackPosition[]).map((pos) => {
    const x = pos.x + pos.width / 2;
    const y = pos.y + pos.height / 2;
    return { x, y };
  });
};

// const motionPathForTrack = (track: ApiTrackResponse): Curve[] => {
//   //  Give a path that just sweeps/smooths the center point of the bounding box.
//   return fitCurve(smoothLine(pointsForTrack(track)));
//
//   // TODO:
//   //  Give a "sweep" path, taken from the silhouette swept over the track.
//   //  Give a "sweep" path, taken from the silhouette swept over the track.
//   //  Give a center-of-mass path, taken from the COM of the silhouette.
//   //  Give direction.
//   //  Give relative speed.
//   // Also, create a "heatmap" of where the animal sat over time, basically multiplying the silhouettes over time?
//
//   // First part is to get good silhouetting.  Part of that is removing noise.
// };

export const motionPathForTrack = (
  track: ApiTrackResponse,
  scale: number,
): MotionPath | null => {
  const pointsForThisTrack = pointsForTrack(track);
  if (pointsForThisTrack.length > 1) {
    // Discard points that aren't far enough from the previous point.
    let prevPoint = pointsForThisTrack[0];
    const decimatedPoints = [prevPoint];
    for (let i = 1; i < pointsForThisTrack.length; i++) {
      while (
        i < pointsForThisTrack.length - 1 &&
        distance(prevPoint, pointsForThisTrack[i]) < 7
      ) {
        i++;
      }
      prevPoint = pointsForThisTrack[i];
      decimatedPoints.push(prevPoint);
    }
    if (
      !equal(
        decimatedPoints[decimatedPoints.length - 1],
        pointsForThisTrack[pointsForThisTrack.length - 1],
      )
    ) {
      decimatedPoints.push(pointsForThisTrack[pointsForThisTrack.length - 1]);
    }

    const scaledPoints = smoothLine(
      decimatedPoints.map((point) => mul(point, scale)),
    );

    // const allPoints = smoothLine(
    //   pointsForThisTrack.map((point) => mul(point, scale))
    // );

    return {
      curve: fitCurve(scaledPoints),
      tangents: [
        normalise(sub(scaledPoints[0], scaledPoints[1])),
        normalise(
          sub(
            scaledPoints[scaledPoints.length - 1],
            scaledPoints[scaledPoints.length - 2],
          ),
        ),
      ],
    };
  }
  return null;
};
