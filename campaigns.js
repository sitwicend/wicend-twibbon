// Tambahkan kampanye dan file bingkainya di sini, lalu commit ke GitHub.
const campaigns = [
  {slug:'bumi-lebih-hijau', title:'Bumi Lebih Hijau', category:'Lingkungan', theme:'green', description:'Ajak teman dan keluarga menjaga lingkungan, mulai dari kebiasaan kecil.', caption:'Langkah kecil hari ini, bumi lebih hijau esok hari. #BumiLebihHijau', frames:['./frames/bumi.svg','./frames/bumi-alt.svg']},
  {slug:'semangat-merdeka', title:'Semangat Merdeka', category:'Hari Besar Nasional', theme:'coral', description:'Rayakan kemerdekaan Indonesia bersama orang-orang terdekat.', caption:'Dirgahayu Indonesia! #SemangatMerdeka', frames:['./frames/merdeka.svg']},
  {slug:'generasi-belajar', title:'Generasi Belajar', category:'Pendidikan', theme:'blue', description:'Bagikan semangat belajar dan dukung pendidikan untuk semua.', caption:'Belajar hari ini, berkarya esok hari. #GenerasiBelajar', frames:['./frames/belajar.svg']}
];
export async function api(path) {
  if (path === '/api/campaigns') return campaigns;
  const campaign = campaigns.find(c => path === '/api/campaigns/' + encodeURIComponent(c.slug));
  if (!campaign) throw new Error('Kampanye tidak ditemukan. Periksa tautan atau pilih bingkai dari halaman Jelajah.');
  return campaign;
}
