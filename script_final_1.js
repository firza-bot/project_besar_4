
                    document.addEventListener('DOMContentLoaded', function() {
                        const dsInput = document.getElementById('dsInput');
                        const dsAuto = document.getElementById('dsAutoComplete');
                        const dsFilterBtn = document.getElementById('dsFilterBtn');
                        const dsFilterPanel = document.getElementById('dsFilterPanel');
                        const dsContainer = document.getElementById('dsContainer');

                        // Dummy Data for Realtime Search
                        const datasets = [
                            { title: 'Data Harga Rumah', sub: 'Data Harga Rumah di Jabodetabek 2024', icon: '🏠' },
                            { title: 'Data Mobil Bekas', sub: 'Harga Pasaran Mobil Bekas Nasional', icon: '🚗' },
                            { title: 'Data Mobil Listrik', sub: 'Penjualan Mobil Listrik (EV) Indonesia', icon: '⚡' },
                            { title: 'Data Transaksi Barang', sub: 'Data Transaksi Barang E-Commerce', icon: '🛒' },
                            { title: 'Demografi Penduduk', sub: 'Data Demografi Penduduk Indonesia 2023', icon: '👥' },
                            { title: 'Infrastruktur Jalan', sub: 'Data Panjang dan Kondisi Infrastruktur Jalan', icon: '🛣️' },
                            { title: 'Statistik Kesehatan', sub: 'Data Statistik Kesehatan Fasilitas Tingkat 1', icon: '⚕️' },
                            { title: 'Data Cuaca BMKG', sub: 'Laporan Cuaca dan Iklim Harian', icon: '⛅' },
                            { title: 'Data Ekspor Impor', sub: 'Statistik Ekspor Impor Komoditas', icon: '🚢' },
                        ];

                        function renderSuggestions(query) {
                            // Filter data
                            const filtered = datasets.filter(d => 
                                d.title.toLowerCase().includes(query.toLowerCase()) || 
                                d.sub.toLowerCase().includes(query.toLowerCase())
                            );

                            if (filtered.length === 0) {
                                dsAuto.innerHTML = `<div class="ds-suggestion" style="justify-content: center; color: var(--muted);"><span class="ds-sugg-title" style="font-weight:normal;">Pencarian tidak ditemukan</span></div>`;
                                return;
                            }

                            // Render HTML with highlighting
                            dsAuto.innerHTML = filtered.map(d => {
                                let titleHtml = d.title;
                                if (query.trim() !== '') {
                                    const regex = new RegExp(`(${query})`, 'gi');
                                    titleHtml = d.title.replace(regex, `<mark style="background: rgba(124, 58, 237, 0.5); color: white; border-radius: 3px; padding: 0 1px;">$1</mark>`);
                                }
                                return `
                                <div class="ds-suggestion" onclick="document.getElementById('dsInput').value = '${d.title}'; document.getElementById('dsAutoComplete').style.display='none';">
                                    <div class="ds-sugg-icon">${d.icon}</div>
                                    <div class="ds-sugg-text">
                                        <span class="ds-sugg-title">${titleHtml}</span>
                                        <span class="ds-sugg-sub">${d.sub}</span>
                                    </div>
                                </div>
                                `;
                            }).join('');
                        }

                        // Event Listeners
                        dsInput.addEventListener('input', (e) => {
                            const query = e.target.value;
                            renderSuggestions(query);
                            dsAuto.style.display = 'block';
                            dsFilterPanel.style.display = 'none';
                        });

                        dsInput.addEventListener('click', () => {
                            renderSuggestions(dsInput.value);
                            dsAuto.style.display = 'block';
                            dsFilterPanel.style.display = 'none';
                        });

                        document.addEventListener('click', (e) => {
                            if (!dsContainer.contains(e.target)) {
                                dsAuto.style.display = 'none';
                                dsFilterPanel.style.display = 'none';
                            }
                        });

                        dsFilterBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            if (dsFilterPanel.style.display === 'block') {
                                dsFilterPanel.style.display = 'none';
                            } else {
                                dsFilterPanel.style.display = 'block';
                                dsAuto.style.display = 'none';
                            }
                        });
                        
                        // Initial render (will override the static HTML when clicked)
                        renderSuggestions('');
                    });
                