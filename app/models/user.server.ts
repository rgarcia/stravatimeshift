import type { User } from "@prisma/client";
import invariant from "tiny-invariant";

import { prisma } from "~/db.server";

export type { User } from "@prisma/client";

export async function getUserById(id: User["id"]) {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserByStravaAthleteID(
  stravaAthleteID: User["stravaAthleteID"],
) {
  return prisma.user.findUnique({ where: { stravaAthleteID } });
}

export async function createUser(
  firstName: string,
  lastName: string,
  stravaAthleteID: number,
  stravaAccessToken: string,
  stravaRefreshToken: string,
) {
  return prisma.user.create({
    data: {
      firstName,
      lastName,
      stravaAthleteID,
      stravaAccessToken,
      stravaRefreshToken,
    },
  });
}

export async function updateUserEmail(id: User["id"], email: string) {
  return prisma.user.update({
    where: { id },
    data: {
      email,
    },
  });
}

export async function updateUserStravaTokens(
  id: User["id"],
  stravaAccessToken: string,
  stravaRefreshToken: string,
) {
  return prisma.user.update({
    where: { id },
    data: {
      stravaAccessToken,
      stravaRefreshToken,
    },
  });
}

export async function deleteUserByEmail(email: User["email"]) {
  invariant(email, "email is required");
  return prisma.user.delete({ where: { email } });
}
