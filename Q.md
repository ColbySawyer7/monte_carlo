# Primary Questions to Answer

## 1. What is the minimum number of pilots and SOs required to support 24/7/365?

### Using DES (Discrete Event Simulation):

1. **Navigate to DES simulation page** (Discrete Event Simulation view)

2. **Select a pre-saved scenario (RECOMMENDED):**
   - In the **Scenario** section at the top, click the **"Select"** dropdown
   - Look for **staffing scenarios** (they have a "Staffing" category badge)
   - For 24/7/365 analysis, select **"Staffing Analysis - 24/7 Flight Ops  - 1 Year"** (1-year horizon = 8760 hours)
   - The scenario will automatically load all settings including:
     - Simulation horizon (8760 hours for 1 year)
     - Mission types and demand patterns
     - Duty requirements
     - Personnel availability factors
   - Review the scenario description that appears below the selector

3. **Configure staffing levels (if needed):**
   - Go to **Config** section → **Settings** tab
   - Check the **"Resource Overrides"** checkbox to enable manual staffing configuration
   - Set initial pilot and SO counts for VMU-1 and VMU-3 (start with current known values)
   - These are the numbers you'll be testing
   - **Note:** If the pre-saved scenario already has staffing configured, you can modify it here

4. **Run the simulation:**
   - Click the **"Run Scenario"** button (play icon) in the Scenario section
   - Wait for results to appear

5. **Check results for adequacy:**
   - Go to **Results** section → **Analysis** tab → **Overview** sub-tab
   - Look for:
     - **"Coverage Assessment"**: Should show "Full Coverage Achieved" or "Adequate Coverage"
     - **"Rejection Breakdown"**: Check "Pilot" and "SO" rejection counts - should be 0 or very low
     - **"Headcount Recommendations"**: If this appears, it means current staffing is insufficient
   - Check **Utilization** tab:
     - Pilot and SO utilization percentages should be below 85% (ideally around 75%)
     - If utilization is > 85%, you need more personnel

6. **Iterate to find minimum:**
   - If you see pilot/SO rejections OR utilization > 85%, increase the counts in Resource Overrides
   - Run simulation again
   - Continue until you achieve:
     - Zero (or near-zero) rejections for pilots and SOs
     - Utilization below 85% (ideally 75% for safety margin)
   - The lowest staffing level that meets these criteria is your minimum

### Using Monte Carlo (for statistical confidence):

1. **Navigate to Monte Carlo simulation page**

2. **Select a pre-saved scenario:**
   - In the **Scenario** section, click the **"Select"** dropdown
   - Choose **"Staffing Analysis - 24/7 Flight Ops  - 1 Year"** or another staffing scenario
   - The scenario will load all configuration automatically

3. **Configure staffing (if needed):**
   - Go to **Config** section → **Settings** tab
   - Enable **"Resource Overrides"** and set pilot/SO counts if you want to test different staffing levels

4. **Set iterations:**
   - In **Monte Carlo Settings**, set iterations to 100-500 (more iterations = more confidence but slower)

5. **Run the simulation:**
   - Click **"Run Scenario"** button

6. **Check results:**
   - **"Rejections by Resource Type"**: Look at "Pilot" and "Sensor Operator" statistics
     - Format: `Average [P10-P90 range] ±stddev`
     - If average rejections are > 0, you need more staffing
   - **"Resource Utilization"**: Check pilot and SO utilization percentages
     - Mean utilization should be below 85%
     - If mean > 85%, increase staffing

7. **Iterate until:**
   - Average rejections for pilots/SOs are near 0
   - Mean utilization is below 85% (ideally 75%)
   - The lowest staffing that achieves this is your minimum

---

## 2. What would be supportable if they were manned less than that number (e.g., 38 pilots instead of 45)?

### Using DES:

1. **Load a baseline scenario:**
   - In the **Scenario** section, select a staffing scenario (e.g., **"Staffing Analysis - 24/7 Flight Ops  - 1 Year"**)
   - This loads a baseline configuration with known staffing levels

2. **Reduce staffing:**
   - Go to **Config** → **Settings** tab
   - Check **"Resource Overrides"** to enable manual staffing configuration
   - Reduce pilot count to 38 (or your target number) for VMU-1 and/or VMU-3
   - Keep SO counts at minimum from Question 1 (or adjust as needed)

3. **Run the simulation:**
   - Click **"Run Scenario"** button

4. **Check results:**
   - **Analysis** tab → **Overview**:
     - **"Mission Success Rate"**: Percentage of missions that completed successfully
     - **"Rejection Breakdown"**: Count of missions rejected due to pilot shortage
     - **"Coverage Assessment"**: Shows if coverage is "Adequate", "Insufficient", or "Critical"
   - **Summary** tab:
     - **"Rejected"** missions count and percentage
   - **Utilization** tab:
     - Pilot utilization (will likely be > 90% if understaffed)

5. **Calculate supportable mission rate:**
   - **Analysis** tab → **Overview** → **"Throughput Analysis"**:
     - Shows **"Missions/Day"**, **"Missions/Week"**, **"Missions/Month"**
   - This tells you the actual supportable rate with reduced staffing
   - Compare to full-staffing rate to see the reduction

### Using Monte Carlo:

1. **Load a baseline scenario:**
   - Select a staffing scenario from the **Scenario** dropdown (e.g., **"Staffing Analysis - 24/7 Flight Ops  - 1 Year"**)

2. **Configure reduced staffing:**
   - Go to **Config** → **Settings** tab
   - Enable **"Resource Overrides"** and set pilot count to 38 (and minimum SOs from Question 1)

3. **Set iterations:**
   - In **Monte Carlo Settings**, set iterations to 100-500

4. **Run the simulation:**
   - Click **"Run Scenario"** button

5. **Check results:**
   - **"Rejections by Resource Type"** → **"Pilot"**: Shows average rejections and range
   - **"Missions Completed"**: Mean and percentiles show expected mission throughput
   - Compare P10 (optimistic) vs P90 (pessimistic) to understand variability

6. **Calculate supportable rate:**
   - Use mean **"Missions Completed"** to calculate missions/day/week/month
   - The P10-P90 range shows uncertainty in the estimate

---

## 3. What if they changed the shift length to 6 or 8 hours instead of 4, how many aircrew would be required for that?

**Important Note:** The system models **duty shifts** (ODO, SDO, SDNCO), not mission flight shifts. Mission duration is configured per mission type, not as a global shift length.

### To Model Different Duty Shift Patterns:

1. **Load a baseline scenario:**
   - In the **Scenario** section, select a staffing scenario (e.g., **"Staffing Analysis - 24/7 Flight Ops  - 1 Year"**)
   - This provides a baseline configuration to compare against

2. **Configure ODO shifts:**
   - Go to **Config** → **Personnel** tab → **"Duty Requirements"** sub-tab
   - **ODO (Operations Duty Officer)** is the closest to "mission shift length"
   - Set **"Hours Per Shift"** to 6 or 8 (instead of default 8)
   - Adjust **"Shifts Per Day"** accordingly:
     - For 6-hour shifts: 4 shifts/day (24 ÷ 6 = 4)
     - For 8-hour shifts: 3 shifts/day (24 ÷ 8 = 3)
   - Keep other duty types (SDO, SDNCO) as needed

3. **Run the simulation:**
   - Click **"Run Scenario"** button

4. **Check results:**
   - **Analysis** tab → **"Crew Performance"** sub-tab:
     - **"ODO Shifts"**: Total number of duty shifts required
   - **Utilization** tab:
     - Pilot and SO utilization may change with different shift patterns
   - **Analysis** tab → **Overview**:
     - **"Headcount Recommendations"**: May change based on shift pattern efficiency

5. **Compare scenarios:**
   - **Save your modified configuration** using the save button in the Scenario section (optional - to compare later)
   - Run with 4-hour shifts (current), 6-hour shifts, and 8-hour shifts
   - Compare utilization and headcount recommendations for each
   - The shift pattern that requires fewer personnel while maintaining coverage is optimal

### If You Want to Model Mission Flight Duration Changes:

1. **Load a baseline scenario:**
   - Select a staffing scenario from the **Scenario** dropdown

2. **Edit mission types:**
   - Go to **Config** → **Operations** tab → **"Mission Types"**
   - Edit each mission type:
     - Change **"Flight Time"** parameters (deterministic value or triangular distribution)
     - This affects how long crews are tied up per mission, which impacts staffing needs

3. **Run and compare:**
   - Click **"Run Scenario"** to see staffing requirements with different flight durations
   - Compare results with baseline scenario

---

## Missing Features (for easier analysis)

The following features would make answering these questions easier but are not currently implemented:

1. **Staffing Sweep/Optimization Tool:**
   - Automatically test multiple staffing levels and report the minimum that achieves zero rejections

2. **Shift Length Impact Analysis:**
   - Direct comparison of different shift lengths with staffing recommendations

3. **Mission Capacity Calculator:**
   - Given staffing, calculate maximum missions/day/week/month

4. **Sensitivity Analysis:**
   - Show how staffing changes affect mission throughput (e.g., "With 38 pilots, you can support X missions/day vs Y with 45")

---

## Quick Reference: Where to Find Key Metrics

- **Scenario Selector:** Top of page → Scenario section → "Select" dropdown (use pre-saved scenarios for best results)
- **Mission Rejections:** Results → Summary tab → "Rejected" count, OR Analysis → Overview → "Rejection Breakdown"
- **Utilization:** Results → Utilization tab → Pilot/SO utilization percentages
- **Headcount Recommendations:** Results → Analysis → Overview → "Headcount Recommendations" (appears if utilization > 85%)
- **Mission Throughput:** Results → Analysis → Overview → "Throughput Analysis" → Missions/Day/Week/Month
- **Coverage Assessment:** Results → Analysis → Overview → "Coverage Assessment" card

**Tips:**
- **Always start with a pre-saved scenario** from the Scenario dropdown - they're pre-configured with appropriate settings
- The **Analysis** tab in DES results is the most useful for staffing questions, as it provides recommendations and coverage assessments
- You can **save custom scenarios** using the save button (disk icon) in the Scenario section to compare different configurations
- Staffing scenarios (marked with "Staffing" badge) are specifically designed for personnel analysis questions
