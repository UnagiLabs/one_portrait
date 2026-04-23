import { loadAdminAthletes } from "../../../../lib/admin/athletes";

export async function GET(): Promise<Response> {
  try {
    return Response.json({
      athletes: await loadAdminAthletes(),
    });
  } catch (error) {
    console.error("Admin status route is unavailable", error);

    return Response.json(
      {
        code: "admin_unavailable",
        message: "Admin status route is unavailable.",
      },
      { status: 503 },
    );
  }
}
