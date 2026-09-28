# Demo accounts

`identity-globe-accounts.csv` is **synthetic account data** for the Identity Globe demo. An
operator imports it into a demo tenant as a **Delimited File** source. After the accounts are
processed, Search returns identities with `city`, `department`, `country`, and `title`
attributes the globe can plot and filter.

## Fresh Setup

Use `identity-globe-accounts.csv` in this directory. It contains 2,012 fictional accounts with
locations, departments, titles, countries, and manager relationships.

### 1. Create a source

1. Open **Admin**, select **Sources**, and click **Create New**.
2. Select **Generic**. On **Delimited File**, click **Configure**.
3. Set a **Source Name**, **Description**, and **Source Owner**, then click **Continue**.

### 2. Upload the flat file

1. Open **Account Management > Account Aggregation** and upload `identity-globe-accounts.csv` under **Import Accounts**.
2. Wait until **Latest Account Aggregation** shows **Success** and **Accounts Scanned** is 2,012. This should take around a minute.
3. Open **Account Management > Accounts** and confirm 2,012 accounts. They are listed as **Uncorrelated** until the identity profile is set up.

### 3. Configure manager correlation

Each account's `manager` value is the employee number of that account's manager.

1. Open **Account Management > Account Correlation**.
2. Under **Manager Correlation**, set **Identity Attribute** to **Employee Number** and **Account Attribute** to `manager`, then click **Save**.

### 4. Create an identity profile

1. Open **Identity Profiles** and click **Create New**.
2. Set a **Name** and **Description**. Set **Source** to the source from step 1, then click **Create**.

Open **Mappings**. For each attribute below, set **Source** to the source from step 1 and set **Attribute** as shown. Leave **Transform** blank.

- **City (city)**: `location`
- **Country (country)**: `country`
- **Department (department)**: `department`
- **Title (title)**: `title`

Click **Save**.

### 5. Apply the identity profile

Click **Apply Changes**. In **Apply Configuration Changes?**, click **Apply Changes** again.

A banner appears: **Identity data is being processed**. Wait for processing to finish before opening the plugin.

### 6. Install the plugin

Install Identity Globe from the [Getting started](../README.md#getting-started) section of the plugin README. Then open the plugin in Identity Security Cloud.
