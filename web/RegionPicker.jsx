import React, { useEffect, useRef, useState } from 'react';
import { CampaignField } from './FieldHelp.jsx';

export function RegionPicker({
  countries,
  countryNames,
  selected = [],
  locations,
  onLocations,
  onChange,
  api,
  run,
  busy,
}) {
  const [country, setCountry] = useState(countries[0] || 'BD');
  const [type, setType] = useState('region');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setResults([]);
    setSearched(false);
    if (!countries.includes(country)) setCountry(countries[0] || 'BD');
  }, [countries.join(','), country, type]);
  return (
    <section className="region-picker">
      <h3>States, regions & cities (optional)</h3>
      <p>
        Compare up to eight areas inside your candidate countries. Europe uses different
        administrative regions. Search names in Meta; selecting an area does not claim demand or
        profitability.
      </p>
      <div className="form-grid">
        <CampaignField
          label="Location country"
          help="Choose a country from this brief before searching its states, provinces, regions or cities."
        >
          <select value={country} onChange={(event) => setCountry(event.target.value)}>
            {countries.map((code) => (
              <option key={code} value={code}>
                {countryNames[code]}
              </option>
            ))}
          </select>
        </CampaignField>
        <CampaignField
          label="Location type"
          help="State, province, division and other large administrative areas use Meta region targeting. Cities use Meta city targeting."
        >
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="region">State / province / region</option>
            <option value="city">City</option>
          </select>
        </CampaignField>
      </div>
      <CampaignField
        label="Search a state, region or city"
        help="Use a real name such as Ontario, Bavaria, California or Dhaka. Only locations returned by Meta can be added. No result may mean the name or targeting type differs."
      >
        <input
          value={query}
          minLength={2}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ontario, Bavaria, California, Dhaka..."
        />
      </CampaignField>
      <button
        type="button"
        className="button secondary"
        disabled={busy || query.trim().length < 2 || !countries.length}
        onClick={() => {
          const current = ++request.current;
          run(async () => {
            const rows = await api('/research/locations/search', 'POST', {
              query: query.trim(),
              country,
              type,
            });
            if (current !== request.current) return;
            setResults(rows);
            setSearched(true);
            onLocations(rows);
          });
        }}
      >
        Search Meta locations
      </button>
      {results.length > 0 && (
        <div className="country-options">
          {results.map((location) => (
            <label key={location.id}>
              <input
                type="checkbox"
                aria-label={`Add ${location.name}`}
                checked={selected.includes(location.id)}
                disabled={!selected.includes(location.id) && selected.length >= 8}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, location.id]
                      : selected.filter((id) => id !== location.id),
                  )
                }
              />
              {location.name} {location.regionName && `· ${location.regionName}`}{' '}
              {location.demo && '(demo)'}
            </label>
          ))}
        </div>
      )}
      {searched && !results.length && (
        <p className="notice">
          No Meta location matched. Try a different spelling, country or location type.
        </p>
      )}
      <div className="region-selections">
        {selected.map((id) => {
          const location = locations.find((row) => row.id === id);
          return (
            <div className="tools-row" key={id}>
              <span>
                {location?.name || id} · {countryNames[location?.country] || ''}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => onChange(selected.filter((value) => value !== id))}
              >
                Remove
              </button>
            </div>
          );
        })}
        {!selected.length && (
          <p className="muted">No regional candidates selected. Research will compare countries.</p>
        )}
      </div>
      <p className="small">
        Keep a small budget in one ad set. Regional findings remain hypotheses until you record real
        customer outcomes.
      </p>
    </section>
  );
}
