using Npgsql;

namespace IdeaFlow;

/// <summary>
/// PostgreSQL bağlantısı və sxem miqrasiyası.
/// Miqrasiyalar idempotentdir (IF NOT EXISTS) — konteyner hər restartda təhlükəsiz işə düşür.
/// </summary>
public static class Db
{
    private static NpgsqlDataSource _ds = null!;

    public static void Init(string connectionString)
    {
        var b = new NpgsqlDataSourceBuilder(connectionString);
        _ds = b.Build();
    }

    public static NpgsqlConnection Open() => _ds.OpenConnection();
    public static ValueTask<NpgsqlConnection> OpenAsync() => _ds.OpenConnectionAsync();

    /// <summary>
    /// Postgres konteyneri app-dan gec qalxa bilər. Compose-da healthcheck var, amma
    /// şəbəkə gecikməsi olarsa da tətbiq çökməsin deyə burada da gözləyirik.
    /// </summary>
    public static async Task WaitForDatabaseAsync(TimeSpan timeout, ILogger log)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (true)
        {
            try
            {
                await using var c = await OpenAsync();
                await using var cmd = new NpgsqlCommand("select 1", c);
                await cmd.ExecuteScalarAsync();
                return;
            }
            catch (Exception ex) when (DateTime.UtcNow < deadline)
            {
                log.LogWarning("Baza hələ hazır deyil ({Msg}) — 2 san sonra yenidən", ex.Message);
                await Task.Delay(2000);
            }
        }
    }

    public static async Task MigrateAsync()
    {
        await using var c = await OpenAsync();
        await Exec(c, Schema);
    }

    private static async Task Exec(NpgsqlConnection c, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, c);
        await cmd.ExecuteNonQueryAsync();
    }

    // ---------------------------------------------------------------- sxem
    private const string Schema = """
    create table if not exists users (
      id          serial primary key,
      email       text        not null,
      pass_hash   text        not null,
      full_name   text        not null,
      role        text        not null check (role in ('author','maker','investor','seller','admin')),
      status      text        not null default 'pending' check (status in ('pending','active','blocked','rejected')),
      company     text        not null default '',
      phone       text        not null default '',
      trust       int         not null default 50 check (trust between 0 and 100),
      lang        text        not null default 'az',
      note        text        not null default '',
      created_at  timestamptz not null default now(),
      approved_at timestamptz,
      approved_by int references users(id) on delete set null
    );
    create unique index if not exists users_email_uniq on users (lower(email));

    create table if not exists sessions (
      token      text        primary key,
      user_id    int         not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      ip         text        not null default '',
      ua         text        not null default ''
    );
    create index if not exists sessions_user on sessions (user_id);

    create table if not exists projects (
      id          serial primary key,
      author_id   int         not null references users(id) on delete cascade,
      title       text        not null,
      descr       text        not null default '',
      category    text        not null,
      status      text        not null default 'draft'
                  check (status in ('draft','assess','demand','findmaker','findinv','deal','prod','sales','rejected')),
      rating      int         not null default 0 check (rating between 0 and 100),
      market      text        not null default '',
      unit_cost   numeric(12,2),
      price       numeric(12,2),
      moq         int,
      royalty     int         not null default 8 check (royalty between 0 and 50),
      risks       text        not null default '[]',
      assessed_at timestamptz,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    );
    create index if not exists projects_author on projects (author_id);
    create index if not exists projects_status on projects (status);

    -- Status tarixçəsi. Huni və «aylar üzrə sövdələşmələr» hesabatları buradan
    -- qurulur — projects.updated_at hər redaktədə dəyişdiyi üçün ona etibar etmək olmaz.
    create table if not exists project_status_log (
      id         bigserial primary key,
      project_id int         not null references projects(id) on delete cascade,
      status     text        not null,
      actor_id   int references users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create index if not exists psl_project on project_status_log (project_id, id);
    create index if not exists psl_status on project_status_log (status, created_at);

    create table if not exists offers (
      id         serial primary key,
      project_id int         not null references projects(id) on delete cascade,
      maker_id   int         not null references users(id) on delete cascade,
      price      numeric(12,2) not null,
      moq        int         not null,
      days       int         not null,
      note       text        not null default '',
      status     text        not null default 'pending'
                 check (status in ('pending','accepted','rejected','withdrawn')),
      created_at timestamptz not null default now()
    );
    create index if not exists offers_project on offers (project_id);
    create index if not exists offers_maker on offers (maker_id);

    create table if not exists investments (
      id          serial primary key,
      project_id  int         not null references projects(id) on delete cascade,
      investor_id int         not null references users(id) on delete cascade,
      amount      numeric(14,2) not null,
      kind        text        not null default 'share',
      note        text        not null default '',
      status      text        not null default 'pending'
                  check (status in ('pending','accepted','rejected','withdrawn')),
      created_at  timestamptz not null default now()
    );
    create index if not exists investments_project on investments (project_id);

    create table if not exists preorders (
      id         serial primary key,
      project_id int         not null references projects(id) on delete cascade,
      seller_id  int         not null references users(id) on delete cascade,
      qty        int         not null check (qty > 0),
      created_at timestamptz not null default now(),
      unique (project_id, seller_id)
    );

    create table if not exists documents (
      id          serial primary key,
      project_id  int         not null references projects(id) on delete cascade,
      kind        text        not null default 'other',
      orig_name   text        not null,
      stored_name text        not null,
      size        bigint      not null,
      mime        text        not null default '',
      uploaded_by int         not null references users(id) on delete cascade,
      created_at  timestamptz not null default now()
    );
    create index if not exists documents_project on documents (project_id);

    create table if not exists messages (
      id         serial primary key,
      project_id int         not null references projects(id) on delete cascade,
      user_id    int         not null references users(id) on delete cascade,
      body       text        not null,
      created_at timestamptz not null default now()
    );
    create index if not exists messages_project on messages (project_id, id);

    create table if not exists audit (
      id         bigserial primary key,
      actor_id   int references users(id) on delete set null,
      action     text        not null,
      entity     text        not null default '',
      entity_id  int,
      meta       text        not null default '',
      ip         text        not null default '',
      created_at timestamptz not null default now()
    );
    create index if not exists audit_created on audit (created_at desc);

    create table if not exists settings (
      key   text primary key,
      value text not null
    );
    """;
}
