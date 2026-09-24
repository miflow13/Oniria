# DEV Library audio

The DEV Library uses the SolarFLEX track **Ambient - Ambient Music** (Pixabay
track 569592) as its continuous ambience.

No audio binary is committed here. The browser requests `/api/library-music`,
which resolves the exact Pixabay track server-side and redirects to the
approved Pixabay audio CDN. The player streams that media and loops it rather
than decoding the full five-minute track into memory.

The previous generated lofi composition and continuous noise/drone layer have
been removed. Footsteps and shelf interaction sounds remain.
