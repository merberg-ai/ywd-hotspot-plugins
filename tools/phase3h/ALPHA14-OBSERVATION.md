# Alpha14 physical observation

Physical Raspberry Pi Zero testing of DMR RX Monitor 0.4.0-alpha14 showed that
the external-vocoder live path can reach real-time throughput during good
periods with 10-frame / 200 ms batches. Observed current decode RTT reached
about 184 ms for a 200 ms audio chunk and the UI reached LIVE state.

Long sustained RX still showed intermittent transport stalls, with observed
maximum decode RTT around 777 ms and accumulated browser underruns. Alpha14 is
therefore preserved as a meaningful sustained-RX observation checkpoint, but is
not marked fully proven for uninterrupted long-call audio.
