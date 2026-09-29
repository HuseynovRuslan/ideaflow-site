using Npgsql;

namespace IdeaFlow;

/// <summary>
/// Sövdələşmə sənədi. «deal» mərhələsində tərəflər və razılaşdırılmış şərtlər
/// (qəbul edilmiş istehsal təklifi, qəbul edilmiş investisiyalar, royalti, platforma
/// komissiyaları) bir müqavilə layihəsinə yığılır. Brauzer onu çap edir / PDF saxlayır.
///
/// Bu, hüquqi cəhətdən yoxlanılmamış LAYİHƏDİR — sənəddə də belə yazılır.
/// </summary>
public static class Contract
{
    private static readonly string[] Stages = ["deal", "prod", "sales"];

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/projects/{id:int}/contract", async (HttpContext ctx, int id) =>
        {
            var (u, fail) = Api.RequireActive(ctx);
            if (fail is not null) return fail;

            await using var c = await Db.OpenAsync();
            var (authorId, status) = await ProjectsApi.LoadOwnerAsync(c, id);
            if (authorId == 0) return Api.Err(404, "e_notFound");
            if (!await CanSeeAsync(c, id, status, u!.Id, u.Role, authorId == u.Id))
                return Api.Err(403, "e_forbidden");

            object? project = null, author = null, maker = null;
            await using (var cmd = new NpgsqlCommand("""
                select p.title, p.category, p.price, p.unit_cost, p.moq, p.royalty, p.descr,
                       u.full_name, u.company, u.email, u.phone,
                       (select min(created_at) from project_status_log where project_id = p.id and status = 'deal')
                from projects p join users u on u.id = p.author_id where p.id = @id
                """, c))
            {
                cmd.Parameters.AddWithValue("id", id);
                await using var r = await cmd.ExecuteReaderAsync();
                await r.ReadAsync();
                var dealAt = r.IsDBNull(11) ? DateTime.UtcNow : r.GetDateTime(11);
                project = new
                {
                    id, title = r.GetString(0), category = r.GetString(1),
                    price = r.IsDBNull(2) ? (decimal?)null : r.GetDecimal(2),
                    unitCost = r.IsDBNull(3) ? (decimal?)null : r.GetDecimal(3),
                    moq = r.IsDBNull(4) ? (int?)null : r.GetInt32(4),
                    royalty = r.GetInt32(5), descr = r.GetString(6),
                    number = $"IF-{dealAt:yyyy}-{id:0000}", dealAt, status,
                };
                author = Party(r, 7);
            }

            await using (var cmd = new NpgsqlCommand("""
                select o.price, o.moq, o.days, o.note, u.full_name, u.company, u.email, u.phone
                from offers o join users u on u.id = o.maker_id
                where o.project_id = @id and o.status = 'accepted' order by o.id desc limit 1
                """, c))
            {
                cmd.Parameters.AddWithValue("id", id);
                await using var r = await cmd.ExecuteReaderAsync();
                if (await r.ReadAsync())
                    maker = new
                    {
                        party = Party(r, 4),
                        price = r.GetDecimal(0), moq = r.GetInt32(1), days = r.GetInt32(2), note = r.GetString(3),
                    };
            }

            var investors = new List<object>();
            await using (var cmd = new NpgsqlCommand("""
                select i.amount, i.kind, i.note, u.full_name, u.company, u.email, u.phone
                from investments i join users u on u.id = i.investor_id
                where i.project_id = @id and i.status = 'accepted' order by i.id
                """, c))
            {
                cmd.Parameters.AddWithValue("id", id);
                await using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                    investors.Add(new
                    {
                        party = Party(r, 3),
                        amount = r.GetDecimal(0), kind = r.GetString(1), note = r.GetString(2),
                    });
            }

            var s = await Settings.AllAsync(c);
            await Audit.LogAsync(c, u.Id, "contract_view", "project", id, null, ctx);
            return Results.Json(new
            {
                project, author, maker, investors,
                fees = new
                {
                    production = s["fee_production"], investment = s["fee_investment"],
                    sales = s["fee_sales"], escrow = s["fee_escrow"],
                },
                generatedAt = DateTime.UtcNow,
            });
        });
    }

    /// <summary>Sənədi yalnız sövdələşmənin tərəfləri görür: müəllif, admin, seçilmiş istehsalçı və investorlar.</summary>
    public static async Task<bool> CanSeeAsync(NpgsqlConnection c, int projectId, string status,
        int userId, string role, bool isOwner)
    {
        if (!Stages.Contains(status)) return false;
        if (role == "admin" || isOwner) return true;
        await using var cmd = new NpgsqlCommand("""
            select exists (
              select 1 from offers      where project_id = @p and maker_id    = @u and status = 'accepted'
              union all
              select 1 from investments where project_id = @p and investor_id = @u and status = 'accepted')
            """, c);
        cmd.Parameters.AddWithValue("p", projectId);
        cmd.Parameters.AddWithValue("u", userId);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    private static object Party(NpgsqlDataReader r, int at) => new
    {
        name = r.GetString(at), company = r.GetString(at + 1),
        email = r.GetString(at + 2), phone = r.GetString(at + 3),
    };
}
