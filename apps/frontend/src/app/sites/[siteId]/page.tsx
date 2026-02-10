import { fetchSites } from "../../../lib/api";

type Props = {
  params: {
    siteId: string;
  };
};

export default async function SiteDetailPage({ params }: Props) {
  const sites = await fetchSites();
  const site = sites.find((s) => s.id === params.siteId);

  if (!site) {
    return (
      <main>
        <h1>Site not found</h1>
        <p>{params.siteId}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1>{site.name}</h1>
        <p>{site.address}</p>
        <p>Region: {site.region}</p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        {site.installations.map((inst) => (
          <div
            key={inst.id}
            style={{
              background: "#151a23",
              border: "1px solid #252b3a",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <h3>{inst.label}</h3>
            <p>ID: {inst.id}</p>
            <p>Status: {inst.device?.status ?? "unknown"}</p>
            <p>Capacity: {inst.capacity ?? "-"}A</p>
          </div>
        ))}
      </section>
    </main>
  );
}
