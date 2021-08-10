# EditVR

EditVR is a webapp for making art in VR. 

My personal, customized version at [https://inkforvr.app](https://inkforvr.app).

Other hosted versions:
- None yet!

I also host an unmodified copy of the latest EditVR release at [https://inkforvr.app/EditVR](https://inkforvr.app/EditVR).

# Tutorials

## Launching the App

[Watch on YouTube.](https://youtu.be/pJyAIPdaLKk)

## Using the User Interface

[Watch on YouTube.](https://youtu.be/A9khuC_4-VA)

## Saving and Opening Files

[Watch on YouTube.](https://youtu.be/NnMmJ2ilfpY)

## Working with Ink

[Watch on YouTube.](https://youtu.be/-t5YhtaQMrA)

## Creating a Mesh

[Watch on YouTube.](https://youtu.be/bFb4h8vZEW8)

## Painting a Mesh

Still to do!

# EditVR vs "Ink for VR"

## Differences

My personal version of EditVR, called "Ink for VR" extends the open source app with some special customizations that I love, but that do not belong in the open source version.
- A beautiful, hand-drawn icon set
- A server-backend list of user accounts and some functions to upload / download files
- A control panel to list and open cloud-saved files

## Save Compatibility

EditVR may be customized and hosted, but customizations should always guarantee that a save file created in the base EditVR app will open correctly. (The reverse may not always be true, as customizations may add special tools.)

# About the Source Code

Still to do!

# Contributing to Development

Please raise an issue first so we can chat about what you want to do / change, then you can make the pull request.

# Customizing & Hosting EditVR

If you host a customized version of EditVR, please let me know! I will add you to the list. :-)
Customized versions must:
- Be served over `https`
- Never load cross-origin resources† 

 † *The VR UI rendering will break! Probably. Chrome is inconsistent about it. Try it out and see what happens.*
