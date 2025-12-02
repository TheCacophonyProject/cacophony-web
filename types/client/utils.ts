import type { JwtTokenPayload } from "./types";

export const decodeJWT = (jwtString: string): JwtTokenPayload | null => {
  const parts = jwtString.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const decodedToken = JSON.parse(atob(parts[1]));
    return {
      ...decodedToken,
      expiresAt: new Date(decodedToken.exp * 1000),
      createdAt: new Date(decodedToken.iat * 1000),
    };
  } catch (e) {
    return null;
  }
};
