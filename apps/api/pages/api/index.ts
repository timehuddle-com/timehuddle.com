import type { NextApiRequest, NextApiResponse } from "next";

export default async function CalcomApi(_: NextApiRequest, res: NextApiResponse) {
  res
    .status(200)
    .json({ message: "Welcome to timehudle.com API - docs are at https://developer.timehuddle.com/api" });
}
