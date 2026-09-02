export async function fetchChampionList() {
  const verRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  const versions = await verRes.json()
  const version = versions[0]

  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)
  const data = await res.json()

  return Object.values(data.data).map(c => ({
    id: c.id,
    key: c.id,
    name: c.name,
    img: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}`,
  }))
}
