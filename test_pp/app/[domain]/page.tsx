import ProductShell from '@/components/ProductShell';

export default function DomainPage({ params }: { params: Promise<{ domain: string }> }) {
  return <ProductShell initialDomain="dashboard" />;
}