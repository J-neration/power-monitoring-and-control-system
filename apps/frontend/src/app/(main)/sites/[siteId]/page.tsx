import type { Metadata } from "next";
import { fetchSites } from "../../../../lib/api";
import SitePageView from "../../../../components/Site/SitePageView";

type Props = {
  params: { siteId: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sites = await fetchSites();
  const site = sites.find((s) => s.id === decodeURIComponent(params.siteId));
  return { title: site?.name ?? "현장 상세" };
}

export default async function SitePage({ params }: Props) {
  const sites = await fetchSites();
  const siteId = decodeURIComponent(params.siteId);
  const site = sites.find((s) => s.id === siteId);

  if (!site) {
    return (
      <main className="site-page">
        <div className="site-empty">
          <h1>현장을 찾을 수 없습니다</h1>
          <p>{siteId}</p>
        </div>
      </main>
    );
  }

  return <SitePageView site={site} />;
}
