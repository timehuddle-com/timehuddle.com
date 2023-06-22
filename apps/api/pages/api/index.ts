import type { NextApiRequest, NextApiResponse } from "next";

export default async function CalcomApi(_: NextApiRequest, res: NextApiResponse) {
  res.status(201).json({ message: "Welcome to Timehuddle API - docs are at https://developer.timehuddle.com/api" });
}
